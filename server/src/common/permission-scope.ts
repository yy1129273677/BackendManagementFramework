import { hasPermission } from "./permissions";

/**
 * 「按路由区分」的权限码：同一个操作在不同路由下是独立权限。
 *
 * 背景（用户 2026-10-19）：
 *   同一张表可能被多条路由引用（比如「订单管理」TABLE 菜单、引用这张表的
 *   「自定义页面示例」自定义页面）。如果按钮权限码只按表算（data:create:TDEMOORDERS），
 *   两条路由下面的按钮其实是同一个码，取消一个另一个也没了。
 *   用户要求：**分配权限时要关联对应路由**，两条路由各自独立授权。
 *
 * 做法：
 *   权限树里生成「路由级」权限码：`<基础码>:route:<路由id>`
 *   例：data:create:TDEMOORDERS:route:9f3c-...
 *
 * 兼容：
 *   老角色上的「基础码」（data:create:TDEMOORDERS、甚至更老的全局 data:create）继续放行，
 *   表示「所有路由都能操作这张表」——避免升级后老角色突然没有写权限。
 */
export function routeScopedPermission(baseCode: string, routeId?: string | null): string | null {
  if (!baseCode || !routeId) return null;
  return `${baseCode}:route:${routeId}`;
}

/**
 * 判断当前用户在某个路由下，是否具备某个「基础权限码」对应的操作权限。
 *
 * 规则：
 *   1. 超管 → 通过
 *   2. 没有配置基础码（比如自定义按钮没配 permission）→ 通过（由上层决定是否另有限制）
 *   3. 用户有基础码 → 通过（老数据兼容：表示所有路由通用）
 *   4. 用户有「路由级码」`<基础码>:route:<routeId>` → 通过（新数据：只在这个路由下生效）
 */
export function hasRouteScopedPermission(
  permissions: string[] | undefined,
  isSuper: boolean,
  baseCode: string | undefined | null,
  routeId?: string | null,
): boolean {
  if (isSuper) return true;
  if (!baseCode) return true;
  if (hasPermission(permissions, false, baseCode)) return true;

  const scoped = routeScopedPermission(baseCode, routeId);
  return scoped ? hasPermission(permissions, false, scoped) : false;
}
