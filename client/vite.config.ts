import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

/**
 * Vite 配置。
 *
 * 干什么：
 *   - 让 .vue 文件能被编译（plugin-vue）
 *   - 配置 @ 指向 src 目录，省得到处写 ../../../
 *   - 开发阶段把 /api 请求代理到本地后端（默认 http://127.0.0.1:3000），
 *     这样前端代码里统一写 /api/xxx，不用管跨域
 *
 * 注意：
 *   - 生产环境由 Nginx 反向代理 /api，不走这里的 proxy
 *   - 后端端口不是 3000 时，改下面的 target，或设置环境变量 VITE_PROXY_TARGET
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // 关掉 sourcemap 让产物更小；排查线上问题时可临时改成 true
    sourcemap: false,
  },
});
