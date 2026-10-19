import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useMenuStore } from "@/stores/menu";
import { setCurrentRouteId } from "@/api/route-context";

/**
 * 路由配置。
 *
 * 分两部分：
 *   1. 静态路由：主系统的管理页面（子系统管理、路由管理、表格配置、用户、角色、字典）
 *      这些页面是写死在代码里的，用得少、改动少，没必要做成配置
 *   2. 动态路由：子系统里的业务页面，登录后从 /api/routes/my 拉下来，
 *      TABLE 类型渲染成 <Table :tcid>，CUSTOM 类型按 componentPath 动态加载 vue 文件
 *
 * 页面文件按用途分成两组放在 views 下，和左侧菜单的两组一一对应：
 *   views/base/     —— 基本路由：代码里写死的静态路由（登录、首页、子系统管理、表格配置、
 *                      路由管理、用户管理、角色管理、业务字典）
 *   views/business/ —— 业务菜单：数据库配出来的动态路由用到的页面
 *                      （runtime 表格容器/找不到页、examples 自定义页面示例）
 *
 * 注意：
 *   用的是 hash 模式（地址栏带 #），部署到 Nginx 时不需要配 try_files 回退，
 *   少一个常见的 404 坑。
 */

/** 布局组件（左侧菜单 + 顶栏 + 内容区） */
const Layout = () => import("@/layout/index.vue");

/**
 * 静态路由表。
 * meta.permission：需要什么权限才显示/可访问（后端还会再校验一次）
 */
export const staticRoutes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/base/login/index.vue"),
    meta: { title: "登录", public: true },
  },
  {
    path: "/",
    name: "root",
    component: Layout,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("@/views/base/dashboard/index.vue"),
        meta: { title: "首页", icon: "HomeFilled" },
      },
      {
        path: "system",
        name: "system",
        component: () => import("@/views/base/system/index.vue"),
        meta: {
          title: "子系统管理",
          icon: "Grid",
          permission: "system:manage",
        },
      },
      {
        path: "table-config",
        name: "tableConfig",
        component: () => import("@/views/base/table-config/index.vue"),
        meta: { title: "表格配置", icon: "Document", permission: "table:read" },
      },
      {
        path: "route",
        name: "route",
        component: () => import("@/views/base/route/index.vue"),
        meta: { title: "路由管理", icon: "Guide", permission: "route:read" },
      },
      {
        path: "user",
        name: "user",
        component: () => import("@/views/base/user/index.vue"),
        meta: { title: "用户管理", icon: "User", permission: "user:read" },
      },
      {
        path: "role",
        name: "role",
        component: () => import("@/views/base/role/index.vue"),
        meta: { title: "角色管理", icon: "Avatar", permission: "role:read" },
      },
      {
        path: "dict",
        name: "dict",
        component: () => import("@/views/base/dict/index.vue"),
        meta: {
          title: "业务字典",
          icon: "Collection",
          permission: "dict:read",
        },
      },
      {
        // 表格预览页：配置完一张表，不建路由也能先看看长什么样
        path: "preview/:tcid",
        name: "tablePreview",
        component: () => import("@/views/business/runtime/table-page.vue"),
        meta: { title: "表格预览", hidden: true, permission: "table:read" },
      },
    ],
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/dashboard",
  },
];

/**
 * 所有 views 下的 vue 文件，做成「路径 → 加载函数」的映射。
 *
 * 用途：自定义页面路由里配的 componentPath（比如 business/examples/demo-table.vue）
 * 就是来这里找对应文件的。找不到说明路径配错了，会渲染一个友好提示页。
 */
const viewModules = import.meta.glob("../views/**/*.vue");

/** 已经注册过的动态路由 name，切换子系统时用来清理 */
let addedRouteNames: string[] = [];

/** 把数据库里的路由注册成真实路由 */
export async function setupDynamicRoutes(router: any): Promise<void> {
  const menuStore = useMenuStore();
  const list = await menuStore.load();

  // 先清掉上一次注册的，避免切换子系统后菜单重复
  removeDynamicRoutes(router);

  for (const item of list) {
    let component: any;

    if (item.type === "TABLE") {
      if (!item.tcid) continue;
      component = () => import("@/views/business/runtime/table-page.vue");
    } else {
      const path = String(item.componentPath || "").replace(/^\/+/, "");
      const key = `../views/${path}`;
      component = viewModules[key];
      if (!component) {
        // 路径配错 / 文件还没提交：渲染提示页，而不是白屏
        component = () => import("@/views/business/runtime/missing-page.vue");
      }
    }

    const name = `dyn-${item.id}`;
    // 需求 002 第 3 条：路由上配的 JSON 配置通过 props 注入页面（自定义页面用 props.routeConfig 接收）
    const routeConfig = item.config ?? null;

    router.addRoute("root", {
      // 子路由要用相对路径（去掉开头的 /），否则会变成顶级路由
      path: String(item.path || "").replace(/^\//, ""),
      name,
      component,
      // 只有自定义页面需要这个 prop；表格页面用不到（避免给 Table 传无意义属性）
      props: item.type === "CUSTOM" ? { routeConfig } : false,
      meta: {
        title: item.title,
        icon: item.icon || "Menu",
        // 动态路由 id：请求头 X-Route-Id 用，后端据此判断「本路由下的按钮权限」
        //（同一张表在两条路由下是两个独立权限码）
        routeId: item.id,
        tcid: item.tcid || "",
        type: item.type,
        // 动态路由不做前端权限校验：能拿到这条路由，说明后端 /routes/my 已经按
        // `menu:<routeId>` 过滤过了（server 是唯一数据源）。
        // 千万不要再用老字段 permissionCode——老数据里残留的 "read" 会把菜单挡成
        // 「点了没反应 / 回到首页」（踩过坑：user1 的订单管理）。
        permission: "",
        accessType: item.accessType || "PUBLIC",
        routeConfig,
        dynamic: true,
      },
    });
    addedRouteNames.push(name);
  }
}

/** 清掉所有动态路由 */
export function removeDynamicRoutes(router: any): void {
  for (const name of addedRouteNames) {
    if (router.hasRoute(name)) router.removeRoute(name);
  }
  addedRouteNames = [];
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes,
});

/** 防止并发重复加载动态路由（比如快速点两次菜单） */
let loadingDynamic = false;

/**
 * 全局前置守卫。
 *
 * 顺序：
 *   1. 公开页面（登录页）放行
 *   2. 没 token → 去登录页，并把原地址记下来登录后跳回去
 *   3. 有 token 但用户信息还没拉 → 拉一次（顺便验证 token 有没有过期）
 *   4. 第一次进来 → 加载动态路由，然后重新走一遍匹配
 *   5. 静态页面检查权限（没权限回首页）
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.public) return true;

  if (!auth.token) {
    return {
      path: "/login",
      query: to.fullPath === "/" ? {} : { redirect: to.fullPath },
    };
  }

  if (!auth.user) {
    try {
      await auth.fetchProfile();
    } catch {
      auth.logout();
      return { path: "/login" };
    }
  }

  // 动态路由只在第一次进入时加载
  if (!loadingDynamic) {
    loadingDynamic = true;
    try {
      await setupDynamicRoutes(router);
    } catch {
      // 加载失败不阻塞页面（图片资源、接口临时挂掉时还能看到管理页）
    }
    // 注册完新路由需要重新解析一次当前地址，否则会命中最后的 404 重定向
    return { path: to.fullPath, replace: true };
  }

  if (to.meta.permission && !auth.hasPermission(String(to.meta.permission))) {
    return { path: "/dashboard" };
  }

  return true;
});

router.afterEach((to) => {
  const title = to.meta?.title ? `${to.meta.title} - 后台管理框架` : "后台管理框架";
  document.title = String(title);
  // 记录当前动态路由 id，请求拦截器会带进 X-Route-Id（静态页面传空）
  setCurrentRouteId(to.meta?.routeId ? String(to.meta.routeId) : "");
});

/** 退出登录或切换子系统时，需要重置动态路由的加载标记 */
export function resetDynamicRouteFlag(): void {
  loadingDynamic = false;
}

/**
 * 标记「动态路由已经准备好了」。
 *
 * 用在 main.ts：带着 token 刷新页面时，先挂载前把动态路由注册好，
 * 这样刷新 /order/list 这种业务页不会先掉到首页再跳回来。
 */
export function markDynamicRoutesReady(): void {
  loadingDynamic = true;
}

export default router;
