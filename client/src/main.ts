import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router, { markDynamicRoutesReady, setupDynamicRoutes } from "./router";
import { TOKEN_KEY } from "./api/request";
import "./styles/index.css";

/**
 * 前端启动入口。
 *
 * 干了这些事：
 *   1. 全量引入 Element Plus（本项目用到的组件多，全量引入省心；体积换开发效率）
 *   2. 注册全部 Element Plus 图标（路由配置里的 icon 是按字符串存的，要能动态渲染）
 *   3. 挂上 Pinia（状态管理）和 Router
 *   4. 如果本地有 token，先注册动态路由再挂载，
 *      这样刷新业务页面（/order/list 这类数据库里配出来的路由）不会先掉回首页
 *
 * 注意：
 *   全量引入会让首屏包大约 1.2MB（gzip 后 400KB 左右）。
 *   以后要优化体积，可以改成按需引入（unplugin-vue-components），
 *   但那需要改构建配置，不是当前阶段的事。
 */
async function bootstrap(): Promise<void> {
  const app = createApp(App);

  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus, { locale: zhCn });

  // 把所有图标注册成全局组件，模板里可以写 <el-icon><List /></el-icon>
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component);
  }

  // 带 token 刷新页面：提前把动态路由装上
  if (localStorage.getItem(TOKEN_KEY)) {
    try {
      await setupDynamicRoutes(router);
      markDynamicRoutesReady();
    } catch {
      // 拉菜单失败不阻塞启动，路由守卫后面还会再试一次
    }
  }

  await router.isReady();
  app.mount("#app");
}

bootstrap();
