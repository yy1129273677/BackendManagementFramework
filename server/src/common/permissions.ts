import { WILDCARD_PERMISSION } from "./constants";

/**
 * 判断一个用户是否具备某个权限码。
 *
 * 干什么：
 *   把「超管通配」「权限数组包含」这套规则抽成一个纯函数，
 *   守卫、表格配置返回「当前用户可做哪些操作」都复用它，保证口径一致。
 *
 * 参数：
 *   permissions - 用户拥有的权限码列表，比如 ['data:read', 'data:create']
 *   isSuper     - 是否超级管理员
 *   required    - 需要校验的权限码
 *
 * 返回：
 *   有权限返回 true，没有返回 false
 *
 * 注意：
 *   超管不需要显式配置权限；即使数组为空也返回 true。
 */
export function hasPermission(permissions: string[] | undefined, isSuper: boolean, required: string): boolean {
  if (isSuper) return true;
  if (!required) return true;
  const list = permissions || [];
  return list.includes(WILDCARD_PERMISSION) || list.includes(required);
}

/**
 * 判断是否同时具备多个权限（全部具备才算有）。
 */
export function hasAllPermissions(permissions: string[] | undefined, isSuper: boolean, required: string[]): boolean {
  if (!required || required.length === 0) return true;
  return required.every((item) => hasPermission(permissions, isSuper, item));
}
