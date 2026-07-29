# EchoLife 部署指南

## 服务器信息
- IP: 8.146.231.250
- 域名: www.unnamed-studio.com
- 面板: 宝塔 9.2.0
- 配置: 2核 4G / 50G ESSD

## 部署步骤

### 第 1 步：安装 Docker（宝塔面板）

1. 登录宝塔面板
2. 左侧菜单 → 「Docker」（或「软件商店」→ 搜索 Docker）
3. 安装 Docker 管理器
4. 确认 Docker 和 Docker Compose 已就绪

### 第 2 步：上传项目

在宝塔面板的「文件」管理器中：
1. 进入 `/www/wwwroot/`
2. 创建文件夹 `echolife`
3. 将项目所有文件上传到 `/www/wwwroot/echolife/`

**必须上传的文件：**
- `docker-compose.yml`
- `deploy.sh`
- `.env.production`
- `apps/` 目录（含 api 和 web 源码）
- `packages/` 目录
- `infra/` 目录（Docker + Nginx 配置）
- `prisma/` 目录
- `pnpm-workspace.yaml`
- `turbo.json`
- `package.json`
- `pnpm-lock.yaml`

### 第 3 步：配置域名 DNS

在域名管理商（阿里云/Cloudflare）将 DNS 解析指向服务器：
- A 记录: `www.unnamed-studio.com` → `8.146.231.250`
- A 记录: `unnamed-studio.com` → `8.146.231.250`

### 第 4 步：开放防火墙端口

宝塔面板 → 「安全」→ 放行端口：
- 80 (HTTP)
- 443 (HTTPS)

### 第 5 步：生成 SSL 证书

SSH 到服务器或使用宝塔终端：
```bash
cd /www/wwwroot/echolife
bash deploy.sh setup   # 安装 Docker（如果宝塔未装）
bash deploy.sh ssl      # 生成 Let's Encrypt SSL 证书
```

### 第 6 步：启动服务

```bash
cd /www/wwwroot/echolife
bash deploy.sh start
```

首次构建约需 10-15 分钟。构建完成后：
- 访问: https://www.unnamed-studio.com
- 管理员邮箱: 查看 .env.production 中的 SEED_ADMIN_EMAIL
- 管理员密码: 查看 .env.production 中的 SEED_ADMIN_PASSWORD

### 常用命令

```bash
bash deploy.sh status    # 查看服务状态
bash deploy.sh logs api  # 查看 API 日志
bash deploy.sh logs web  # 查看前端日志
bash deploy.sh restart   # 重启所有服务
bash deploy.sh stop      # 停止所有服务
```

## 注意事项

1. **首次登录后立即修改管理员密码**
2. **DeepSeek API Key** 需要在登录后通过 API Key 管理界面重新设置
3. SSL 证书有效期 90 天，已配置自动续期
4. 数据库和 Redis 数据持久化在 Docker Volume 中
