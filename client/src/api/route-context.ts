/**
 * 当前所在「动态路由」的 id（供请求头 X-Route-Id 使用）。
 *
 * 为什么要单独存：
 *   后端要判断「这个路由下的按钮权限」（权限码是 `<基础码>:route:<routeId>`），
 *   但 axios 拦截器不在组件里，拿不到 useRoute()。所以由路由守卫在每次跳转后写进来，
 *   拦截器读出去塞进请求头。
 *
 * 注意：
 *   这里不 import 任何东西，避免 request.ts ↔ router/index.ts 循环依赖。
 */
let currentRouteId = "";

/** 路由跳转后调用：记录当前动态路由 id（静态页面传空） */
export function setCurrentRouteId(routeId?: string | null): void {
  currentRouteId = routeId ? String(routeId) : "";
}

/** 请求拦截器调用：拿当前路由 id（空表示当前页面不是动态路由） */
export function getCurrentRouteId(): string {
  return currentRouteId;
}
