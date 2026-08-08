#!/bin/bash
# R3-DEPLOY-004: Use pipefail to catch errors in piped commands
set -euo pipefail

# ===== EchoLife Deployment Script =====
# Server: 47.103.20.211
# Usage: bash deploy.sh [setup|start|stop|restart|logs|ssl]
# =====

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables
# 自动检测项目目录，兼容 /www/wwwroot/echolife 与 /opt/echolife 等部署路径
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"
DOMAIN="www.unnamed-studio.com"

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   EchoLife 部署脚本 v1.0               ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}❌ 错误: .env.production 文件不存在！${NC}"
  echo -e "${YELLOW}请确保 .env.production 文件已上传到 $PROJECT_DIR${NC}"
  exit 1
fi

# Load environment variables
# R3-DEPLOY-002: Use set -a / source / set +a for safe env loading.
# The previous `export $(grep -v '^#' | xargs)` approach breaks on values
# with spaces, special characters, or empty lines.
set -a
source "$ENV_FILE"
set +a

case "${1:-start}" in

  setup)
    echo -e "${YELLOW}📦 安装 Docker 和 Docker Compose...${NC}"

    # Install Docker
    if ! command -v docker &> /dev/null; then
      curl -fsSL https://get.docker.com | sh
      systemctl start docker
      systemctl enable docker
      echo -e "${GREEN}✅ Docker 安装完成${NC}"
    else
      echo -e "${GREEN}✅ Docker 已安装${NC}"
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
      echo -e "${YELLOW}安装 Docker Compose 插件...${NC}"
      yum install -y docker-compose-plugin || apt-get install -y docker-compose-plugin
    fi
    echo -e "${GREEN}✅ Docker Compose 就绪${NC}"

    # Open firewall ports
    echo -e "${YELLOW}🔥 配置防火墙...${NC}"
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true
    firewall-cmd --permanent --add-port=443/tcp 2>/dev/null || true
    firewall-cmd --reload 2>/dev/null || true
    echo -e "${GREEN}✅ 防火墙已配置 (80, 443)${NC}"

    echo -e "${GREEN}✅ 环境准备完成！${NC}"
    echo -e "${YELLOW}下一步: bash deploy.sh ssl (生成SSL证书)${NC}"
    echo -e "${YELLOW}然后:  bash deploy.sh start (启动服务)${NC}"
    ;;

  ssl)
    echo -e "${YELLOW}🔒 生成 SSL 证书...${NC}"
    mkdir -p $PROJECT_DIR/infra/nginx/ssl

    # Try Let's Encrypt first (requires domain + port 80 free)
    if command -v certbot &> /dev/null || yum install -y certbot 2>/dev/null || apt-get install -y certbot 2>/dev/null; then
      echo -e "${YELLOW}尝试 Let's Encrypt 证书: $DOMAIN...${NC}"
      # Stop nginx to free port 80
      docker compose -f $PROJECT_DIR/docker-compose.deploy.yml --env-file $ENV_FILE stop nginx 2>/dev/null || true

      CERTBOT_EMAIL="${SEED_ADMIN_EMAIL:-admin@echolife.ai}"
      if certbot certonly --standalone -d $DOMAIN -d unnamed-studio.com --non-interactive --agree-tos -m "$CERTBOT_EMAIL"; then
        cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $PROJECT_DIR/infra/nginx/ssl/
        cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $PROJECT_DIR/infra/nginx/ssl/
        echo -e "${GREEN}✅ Let's Encrypt 证书已安装: $DOMAIN${NC}"
      else
        echo -e "${YELLOW}⚠️  Let's Encrypt 失败，使用自签名证书...${NC}"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout $PROJECT_DIR/infra/nginx/ssl/privkey.pem \
          -out $PROJECT_DIR/infra/nginx/ssl/fullchain.pem \
          -subj "/C=CN/ST=Beijing/L=Beijing/O=EchoLife/CN=$DOMAIN"
        echo -e "${GREEN}✅ 自签名证书已生成${NC}"
      fi
    else
      echo -e "${YELLOW}certbot 安装失败，使用自签名证书...${NC}"
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout $PROJECT_DIR/infra/nginx/ssl/privkey.pem \
        -out $PROJECT_DIR/infra/nginx/ssl/fullchain.pem \
        -subj "/C=CN/ST=Beijing/L=Beijing/O=EchoLife/CN=$DOMAIN"
      echo -e "${GREEN}✅ 自签名证书已生成${NC}"
    fi

    # Set up auto-renewal (使用 docker-compose.deploy.yml 而非 docker-compose.yml)
    # R3-DEPLOY-003: Append to existing crontab instead of replacing it entirely
    ( crontab -l 2>/dev/null | grep -v "certbot renew.*$DOMAIN" ; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/*.pem $PROJECT_DIR/infra/nginx/ssl/ && docker compose -f $PROJECT_DIR/docker-compose.deploy.yml --env-file $ENV_FILE restart nginx" ) | crontab - 2>/dev/null || true
    echo -e "${GREEN}✅ SSL 配置完成${NC}"
    ;;

  letsencrypt)
    DOMAIN=$2
    if [ -z "$DOMAIN" ]; then
      echo -e "${RED}❌ 用法: bash deploy.sh letsencrypt your-domain.com${NC}"
      exit 1
    fi
    echo -e "${YELLOW}🔒 使用 Let's Encrypt 生成证书: $DOMAIN${NC}"

    # Install certbot
    yum install -y certbot || apt-get install -y certbot

    # Stop nginx to free port 80
    docker compose -f $PROJECT_DIR/docker-compose.deploy.yml --env-file $ENV_FILE stop nginx 2>/dev/null || true

    # Generate certificate
    CERTBOT_EMAIL="${SEED_ADMIN_EMAIL:-admin@echolife.ai}"
    certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m "$CERTBOT_EMAIL"

    # Copy certificates
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $PROJECT_DIR/infra/nginx/ssl/
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $PROJECT_DIR/infra/nginx/ssl/

    echo -e "${GREEN}✅ Let's Encrypt 证书已安装: $DOMAIN${NC}"
    echo -e "${YELLOW}更新 .env.production 中的 CORS_ORIGINS 和 NEXT_PUBLIC_API_URL 为你的域名${NC}"
    ;;

  start)
    echo -e "${YELLOW}🚀 启动 EchoLife 服务...${NC}"

    # Check SSL certificates
    if [ ! -f "$PROJECT_DIR/infra/nginx/ssl/fullchain.pem" ]; then
      echo -e "${YELLOW}⚠️  SSL 证书不存在，自动生成...${NC}"
      bash $0 ssl
    fi

    cd $PROJECT_DIR

    # R3-DEPLOY-001: Use docker-compose.deploy.yml (pre-built images from ACR)
    # instead of docker-compose.yml (local build). The deploy compose uses
    # image: from ACR, avoiding OOM on the 2vCPU/4GiB server.
    echo -e "${CYAN}拉取 Docker 镜像...${NC}"
    # R3-DEPLOY-007: Removed --no-cache. Use --no-cache only for troubleshooting
    # image build issues: docker compose -f docker-compose.deploy.yml build --no-cache
    docker compose -f docker-compose.deploy.yml --env-file .env.production pull

    echo -e "${CYAN}启动服务...${NC}"
    # R3-DEPLOY-006: No automatic rollback yet. If deployment fails, manually
    # restore the previous image tag from ACR and re-run this command.
    docker compose -f docker-compose.deploy.yml --env-file .env.production up -d

    # R3-DEPLOY-005: Replace hardcoded sleep 30 with health check loop
    echo -e "${YELLOW}等待服务启动 (健康检查)...${NC}"
    for i in $(seq 1 12); do
      if curl -sf http://localhost/api/v1/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过 (第 $i 次尝试)${NC}"
        break
      fi
      echo -e "${YELLOW}等待服务就绪... (第 $i/12 次尝试)${NC}"
      sleep 5
    done

    # Check status
    docker compose -f docker-compose.deploy.yml --env-file .env.production ps

    echo -e "${GREEN}✅ EchoLife 服务已启动！${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🌐 访问地址: https://47.103.20.211${NC}"
    echo -e "${GREEN}📊 API 健康: https://47.103.20.211/api/v1/health${NC}"
    echo -e "${GREEN}👤 管理员: 查看 .env.production 中的 SEED_ADMIN_EMAIL${NC}"
    echo -e "${YELLOW}⚠️  首次登录后请立即修改密码${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    ;;

  stop)
    echo -e "${YELLOW}🛑 停止服务...${NC}"
    cd $PROJECT_DIR
    docker compose -f docker-compose.deploy.yml --env-file .env.production down
    echo -e "${GREEN}✅ 服务已停止${NC}"
    ;;

  restart)
    echo -e "${YELLOW}🔄 重启服务...${NC}"
    cd $PROJECT_DIR
    docker compose -f docker-compose.deploy.yml --env-file .env.production restart
    echo -e "${GREEN}✅ 服务已重启${NC}"
    ;;

  logs)
    SERVICE=$2
    cd $PROJECT_DIR
    if [ -n "$SERVICE" ]; then
      echo -e "${CYAN}查看 $SERVICE 日志...${NC}"
      docker compose -f docker-compose.deploy.yml --env-file .env.production logs -f --tail=100 $SERVICE
    else
      echo -e "${CYAN}查看所有日志...${NC}"
      docker compose -f docker-compose.deploy.yml --env-file .env.production logs -f --tail=100
    fi
    ;;

  status)
    cd $PROJECT_DIR
    docker compose -f docker-compose.deploy.yml --env-file .env.production ps
    ;;

  *)
    echo "用法: bash deploy.sh [setup|ssl|letsencrypt|start|stop|restart|logs|status]"
    echo ""
    echo "命令:"
    echo "  setup        - 安装 Docker 和配置环境"
    echo "  ssl          - 生成自签名 SSL 证书"
    echo "  letsencrypt  - 使用 Let's Encrypt 生成证书 (需要域名)"
    echo "  start        - 构建并启动所有服务"
    echo "  stop         - 停止所有服务"
    echo "  restart      - 重启所有服务"
    echo "  logs [服务名] - 查看日志"
    echo "  status       - 查看服务状态"
    ;;
esac
