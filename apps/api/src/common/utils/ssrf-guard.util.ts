/**
 * SSRF 防护工具 — 拦截指向内网/元数据端点的 URL。
 *
 * 使用方式：
 *   if (!isSafeUrl(url)) { throw new Error('URL 被拒绝（SSRF 防护）'); }
 *   // 异步版本（推荐用于 fetch 前）：await isSafeUrlAsync(url)
 *
 * 阻止的地址范围：
 *  - 回环地址：127.0.0.0/8, ::1, localhost
 *  - 全零地址：0.0.0.0
 *  - 链路本地：169.254.0.0/16（含 AWS/GCP/Azure 元数据 169.254.169.254）
 *  - 私有网络：10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *  - 云元数据域名：metadata.google.internal, metadata, metadata.azure.com
 *  - IPv6 本地地址：fc00::/7（唯一本地）, fe80::/10（链路本地）
 */

import * as dns from 'node:dns';

/** 被禁止的云元数据域名 */
const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  'metadata.azure.com',
]);

/**
 * 检查 IP 地址是否属于内网/保留范围。
 * 仅处理 IPv4 和简单 IPv6 格式。
 */
function isPrivateIp(ip: string): boolean {
  // 去除 IPv6 区域标识（如 fe80::1%eth0）
  const cleanIp = ip.split('%')[0];

  // ---- IPv4 ----
  const v4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4Match) {
    const octets = v4Match.slice(1, 5).map(Number);

    // 验证每个八位组在 0-255 范围内
    if (octets.some((o) => o < 0 || o > 255)) return true;

    const [a, b] = octets;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8（回环）
    if (a === 127) return true;
    // 169.254.0.0/16（链路本地 / 云元数据）
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12（172.16.x.x - 172.31.x.x）
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10（运营商级 NAT，CGNAT）
    if (a === 100 && b >= 64 && b <= 127) return true;

    return false;
  }

  // ---- IPv6 ----
  const lowerIp = cleanIp.toLowerCase();

  // ::1 回环
  if (lowerIp === '::1') return true;
  // ::  全零
  if (lowerIp === '::') return true;
  // IPv4-mapped IPv6（如 ::ffff:127.0.0.1）
  const mappedMatch = lowerIp.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedMatch) {
    return isPrivateIp(mappedMatch[1]);
  }
  // fc00::/7 唯一本地地址（ULA）
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true;
  // fe80::/10 链路本地
  if (lowerIp.startsWith('fe8') || lowerIp.startsWith('fe9') ||
      lowerIp.startsWith('fea') || lowerIp.startsWith('feb')) return true;

  return false;
}

/**
 * 判断 URL 是否安全（非内网地址、非元数据端点）。
 *
 * @param url 待检查的 URL 字符串
 * @returns true 表示安全可访问，false 表示被 SSRF 防护拦截
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // 仅允许 http/https 协议
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 阻止已知的元数据域名
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;

  // 阻止 localhost
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;

  // 检查 IP 地址是否为内网
  if (isPrivateIp(hostname)) return false;

  return true;
}

/**
 * 判断字符串是否为 IP 地址（IPv4 或 IPv6）。
 */
function isIpAddress(hostname: string): boolean {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  // IPv6（包含冒号，可能被方括号包裹但此处已去除）
  if (hostname.includes(':')) return true;
  return false;
}

/**
 * 异步版本：解析域名后检查实际 IP 是否安全。
 *
 * 同步版本 {@link isSafeUrl} 仅检查 URL 字符串中的 IP / 域名，
 * 无法防御 DNS rebinding 攻击（攻击者在 URL 中使用公网域名，
 * 但 DNS 解析时返回内网地址）。
 *
 * 本函数在同步检查通过后，额外进行 DNS 解析并检查所有解析结果。
 *
 * @param url 待检查的 URL 字符串
 * @returns true 表示安全可访问，false 表示被 SSRF 防护拦截
 */
export async function isSafeUrlAsync(url: string): Promise<boolean> {
  // 第一层：同步快速检查 URL 字符串
  if (!isSafeUrl(url)) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 如果 hostname 已经是 IP 地址，同步检查已充分
  if (isIpAddress(hostname)) return true;

  // 第二层：DNS 解析后检查实际 IP
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return false;
      }
    }
    return addresses.length > 0;
  } catch {
    // DNS 解析失败，保守拒绝
    return false;
  }
}
