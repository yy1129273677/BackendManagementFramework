#!/usr/bin/env bash
# =============================================================================
# 服务器一键更新脚本
#
# 用法（在服务器的项目根目录执行，一般就是 ~/bmf/update.sh）：
#   bash update.sh
#
# 它按顺序做这些事：
#   1. git pull 拉最新代码
#   2. docker compose up -d 用已上传的镜像重建容器（默认不在服务器上 build）
#
# 为什么默认不 build：
#   这台云服务器拉 Docker Hub 基础镜像极慢（node:22-alpine 的 55MB 层
#   拉 10 分钟还是 0B），在服务器上 build 基本会卡死。
#   所以镜像由本机 `deploy-images.ps1` 构建、上传。
#   如果你确实想在服务器上构建：bash update.sh --build

#   3. 等后端健康检查通过（最多 90 秒）
#   4. 打印容器状态 + 跑一遍自检（健康接口、登录接口）
#
# 为什么后端要等：
#   容器「已启动」和「能接请求」是两件事。Node 起来后还要连数据库、
#   执行 prisma migrate deploy，这几秒内请求会 502。
#   不等的话会把正常重启误判成失败。
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 1/4 拉取代码"
git pull --ff-only

BUILD_FLAG=""
if [ "${1:-}" = "--build" ]; then BUILD_FLAG="--build"; fi
if [ -z "$BUILD_FLAG" ]; then
    echo "==> 2/4 用已上传的镜像重建容器（不在服务器上构建；要构建请用 --build）"
else
    echo "==> 2/4 在服务器上构建并启动容器（会拉 Docker Hub，可能很慢）"
fi
docker compose up -d $BUILD_FLAG

echo "==> 3/4 等待后端就绪（最多 90 秒）"
BACKEND_READY=0
for i in $(seq 1 45); do
    if docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
        BACKEND_READY=1
        echo "    后端已就绪（第 ${i} 次探测）"
        break
    fi
    sleep 2
done

if [ "$BACKEND_READY" -ne 1 ]; then
    echo "!! 后端 90 秒内没就绪，下面是最近日志："
    docker compose logs --tail=80 server
    exit 1
fi

echo "==> 4/4 自检"
echo "---- 容器状态 ----"
docker compose ps

echo "---- 健康检查 ----"
curl -fsS http://127.0.0.1:8081/healthz && echo " (nginx ok)" || echo "!! nginx 不可用"
curl -fsS http://127.0.0.1:8081/api/health && echo "" || echo "!! 后端健康接口不可用"

echo ""
echo "✅ 更新完成"
echo "   前端入口： http://<服务器公网IP>:8081"
echo "   提示：改了 JWT_SECRET 后需要重新登录；改了数据库密码需要重建数据卷（会清空数据）"
