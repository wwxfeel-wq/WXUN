# EchoLife CI/CD 使用说明

## 架构

```
git push  →  GitHub Actions (7 GiB runner) 构建 web/api 镜像
                     ↓
              阿里云 ACR (杭州)
                     ↓
      GitHub Actions SSH 到 ECS  →  docker compose pull + up -d
```

服务器 (2 vCPU / 4 GiB) 只负责运行，不再本地 build，彻底避开 OOM。

## 一次性配置

### 1. GitHub 仓库 Secrets

在 `Settings → Secrets and variables → Actions` 添加：

| Secret | 值 |
|---|---|
| `ACR_USERNAME` | `wwxfeel20` （阿里云主账号名）|
| `ACR_PASSWORD` | 你在 ACR 控制台"访问凭证"设置的固定密码 |
| `ACR_NAMESPACE` | 命名空间名（截图看到"摘要=00000"，实际值以命名空间管理页为准）|
| `SSH_HOST` | `47.103.20.211` |
| `SSH_USER` | `root` |
| `SSH_PASSWORD` | 服务器 root 密码 |
| `NEXT_PUBLIC_API_URL` | `https://47.103.20.211/api/v1` |

### 2. 服务器 `.env.production` 追加两行

```
ACR_REGISTRY=crpi-2ybx9wocff19tlzj.cn-hangzhou.personal.cr.aliyuncs.com
ACR_NAMESPACE=<你在 ACR 建的命名空间名>
```

### 3. 服务器登录 ACR（一次）

```
docker login crpi-2ybx9wocff19tlzj.cn-hangzhou.personal.cr.aliyuncs.com \
  -u wwxfeel20 -p <ACR 固定密码>
```

## 日常开发流程

1. 本地改代码 → `git push origin main`
2. GitHub Actions 自动触发：
   - 构建 `echolife-web` 和 `echolife-api` 镜像
   - 推送到 ACR
   - SSH 到 ECS 执行 `docker compose pull && up -d`
3. 大约 8-12 分钟后，https://47.103.20.211/ 就是新版本

## 手动部署（应急）

在服务器上：

```
cd /www/wwwroot/echolife
bash scripts/deploy-pull.sh          # 拉 latest
bash scripts/deploy-pull.sh abc1234  # 指定 short_sha 版本
```

## 回滚

在服务器上：

```
cd /www/wwwroot/echolife
# 查看镜像所有版本
docker images | grep echolife-web
# 用指定 tag 启动（tag 就是 GitHub commit 的 short SHA）
bash scripts/deploy-pull.sh <old_short_sha>
```

或者直接改 `docker-compose.deploy.yml` 里的 `:latest` 为 `:<old_short_sha>`。

## 常见问题

**Q: Actions 构建失败 "denied: requested access to the resource is denied"**
A: 检查 ACR 命名空间设置里是否勾选了"自动创建仓库"，或先在 ACR 手动建
   `echolife-web` / `echolife-api` 两个仓库。

**Q: 服务器 pull 时提示 unauthorized**
A: 重新 `docker login`；ACR 个人版临时 token 有效期 1 小时，用固定密码不会过期。

**Q: 构建时长**
A: 首次构建约 8-10 分钟；后续有 GHA cache 一般 3-5 分钟。
