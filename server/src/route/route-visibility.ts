import { hasPermission } from "../common/permissions";

/**
 * 判断「某个用户能不能看到某条菜单（路由）」。
 *
 * 抽成纯函数的原因：
 *   这段逻辑以前写在 route.service.myRoutes 里，出了两个坑--
 *     1. accessType=ROLE 的路由，除了要求新的 `menu:<routeId>`，还去校验老字段 permissionCode，
 *        结果老数据（permissionCode="read"）把菜单一直挡住，管理员怎么勾都不显示；
 *     2. 这段逻辑没法单测（要连数据库），所以坑一直没被发现。
 *   抽出来以后可以直接用单测锁死行为。
 *
 * 规则（和需求 002 的权限模型对齐）：
 *   - 超管：全部可见
 *   - accessType=ROLE：只看新的菜单权限码 `menu:<routeId>`，**忽略 permissionCode**
 *   - accessType=PUBLIC：
 *       - 如果老数据上还挂着 permissionCode，则继续按它控制（需求 002 之前的机制，保持兼容）
 *       - 否则所有人可见（登录即可见）
 */
export interface RouteVisibilityInput {
  /** 路由 id，用来拼菜单权限码 menu:<routeId> */
  id: string;
  /** PUBLIC / ROLE，历史数据可能为空（按 PUBLIC 处理） */
  accessType?: string | null;
  /** 需求 002 之前的权限码字段，现在只有 PUBLIC 老数据还会用到 */
  permissionCode?: string | null;
}

/**
 * @param route       路由（只需要 id / accessType / permissionCode）
 * @param permissions 当前用户 token 里的权限码
 * @param isSuper     是否超管
 */
export function canSeeRoute(route: RouteVisibilityInput, permissions: string[], isSuper: boolean): boolean {
  // 超管永远能看到所有菜单（包括按角色控制的）
  if (isSuper) return true;

  const accessType = String(route.accessType || "PUBLIC").toUpperCase();

  // 新的按角色控制：只看 menu:<routeId>
  // 注意这里**不再校验 permissionCode**：那个字段在新界面里已经不能编辑了，
  // 老数据里残留的值（比如 "read"）会把菜单永久挡住，属于必须忽略的过期配置。
  if (accessType === "ROLE") {
    return hasPermission(permissions, false, `menu:${route.id}`);
  }

  // 公开菜单：老数据如果配了 permissionCode，继续按它控制（兼容需求 002 之前的配置）
  if (route.permissionCode) {
    return hasPermission(permissions, false, route.permissionCode);
  }

  return true;
}
