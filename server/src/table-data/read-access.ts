import { hasPermission } from "../common/permissions";

/**
 * 判断「某个用户能不能读某张表的数据」。
 *
 * 设计原则（用户 2026-10-19 明确要求）：
 *   **菜单打勾 = 能看到这个页面，自然就能读这张表的数据**，
 *   不应该再让管理员额外勾一个「读取表格数据（所有表）」的全局开关。
 *
 * 所以读权限的来源按优先级：
 *   1. 超管 —— 永远能读
 *   2. 老角色上残留的全局 `data:read` —— 继续放行（需求 002 之前的配置，保持兼容）
 *   3. 这张表绑定的菜单：
 *      - `accessType=ROLE`：用户有 `menu:<routeId>`（也就是在权限树里勾了该菜单）
 *      - `accessType=PUBLIC`：公开菜单，登录即可读
 *   4. 都不满足 → 拒绝
 *
 * 抽成纯函数的原因：这段是权限核心逻辑，必须能单测；
 * 而且它踩过坑（全局 data:read 从权限树里拿掉导致所有查询 403）。
 */
export interface ReadableRouteLike {
  /** 路由 id，用来拼菜单权限码 menu:<routeId> */
  id: string;
  /** PUBLIC / ROLE，历史数据可能为空（按 PUBLIC 处理） */
  accessType?: string | null;
  /** 菜单是否显示；隐藏的菜单不应该授权读数据 */
  visible?: boolean | null;
}

/**
 * @param routes      这张表（tcid）绑定的所有路由
 * @param permissions 当前用户 token 里的权限码
 * @param isSuper     是否超管
 */
export function canReadTable(routes: ReadableRouteLike[], permissions: string[], isSuper: boolean): boolean {
  // 超管不受限制
  if (isSuper) return true;

  // 老数据兼容：角色里已经配了全局 data:read 的，继续放行
  if (hasPermission(permissions, false, "data:read")) return true;

  // 看这张表绑定的菜单：勾了菜单就能读
  for (const route of routes || []) {
    if (route.visible === false) continue;

    const accessType = String(route.accessType || "PUBLIC").toUpperCase();
    if (accessType === "ROLE") {
      if (hasPermission(permissions, false, `menu:${route.id}`)) return true;
      continue;
    }

    // 公开菜单：登录即可见，也就可以读它的数据
    return true;
  }

  return false;
}
