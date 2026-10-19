# =============================================================================
# 前端镜像：两阶段构建
#   第一阶段用 node 跑 vite build 产出 dist
#   第二阶段把 dist 塞进 nginx，并把 /api 反向代理到后端容器
#
# 最终镜像只有 nginx + 静态文件（约 50MB），不含 node_modules。
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# 换 npm 源：大陆服务器上官方源慢到不可用
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:1.27-alpine

# 自带的默认站点配置换成我们的（SPA + /api 反代）
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
