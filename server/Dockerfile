# =============================================================================
# 后端生产镜像
#
# 说明：
#   - 单阶段构建（没有拆 builder/runner），代价是镜像大一些（约 600MB），
#     好处是镜像里保留了 prisma CLI 和 ts-node，
#     所以 `prisma migrate deploy` 和 `npm run seed` 都能在容器里直接跑。
#     这套系统是内部工具，优先"运维简单"而不是"镜像最小"。
#   - 用 node:22-alpine + openssl：Prisma 的查询引擎在 alpine 上需要 openssl。
# =============================================================================
FROM node:22-alpine

WORKDIR /app

# Prisma 引擎依赖 openssl；tzdata 让容器内时区可用
RUN apk add --no-cache openssl tzdata

# 先只拷依赖清单，利用 Docker 层缓存：只改代码时不用重新装依赖
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# 拷源码并构建（prisma generate 已包含在 build 脚本里）
COPY . .
RUN npm run build

EXPOSE 3000

# 启动时先执行数据库迁移，再起服务。
# 为什么迁移放启动命令里：容器重启时能自动补齐新迁移，不用人工记得跑一次。
# 种子数据不在这里跑（避免每次重启都动数据），需要时手动：
#   docker compose exec server npm run seed
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
