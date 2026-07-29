#!/bin/bash
# ===== 服务器手动拉取最新镜像并重启 =====
# 前置：已在 .env.production 里设置 ACR_REGISTRY / ACR_NAMESPACE
# 前置：已 docker login <ACR_REGISTRY>
# 用法：bash scripts/deploy-pull.sh [tag]     tag 默认 latest

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

TAG="${1:-latest}"

if [ ! -f .env.production ]; then
  echo "❌ .env.production 不存在"
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -v '^#' .env.production | xargs)

if [ -z "$ACR_REGISTRY" ] || [ -z "$ACR_NAMESPACE" ]; then
  echo "❌ .env.production 中缺少 ACR_REGISTRY 或 ACR_NAMESPACE"
  exit 1
fi

echo "==> 使用镜像 tag: $TAG"
echo "==> 拉取镜像..."
docker compose -f docker-compose.deploy.yml --env-file .env.production pull web api

echo "==> 更新服务..."
docker compose -f docker-compose.deploy.yml --env-file .env.production up -d

echo "==> 清理旧镜像..."
docker image prune -f

echo "==> 完成. 当前状态:"
docker compose -f docker-compose.deploy.yml --env-file .env.production ps
