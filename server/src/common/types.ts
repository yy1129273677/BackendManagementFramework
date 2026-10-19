/**
 * 通用类型定义。
 */

/**
 * JWT 里承载的用户信息。
 *
 * 注意（2026-10-19 起）：
 *   token 里虽然仍带着 permissions 字段（兼容旧 token），但**后端不再信任它**。
 *   `JwtStrategy.validate` 每次请求会按 user.sub 查库，用「最新的角色权限」覆盖
 *   request.user.permissions（见 auth/jwt-user.ts）。
 *   所以改完权限刷新页面就生效，不需要重新登录。
 */
export interface JwtUser {
  /** 用户 id */
  sub: string;
  username: string;
  nickname?: string;
  /** 用户所属系统 id（租户 id） */
  systemId: string;
  /** 用户所属系统编码，比如 main / demo */
  systemCode: string;
  /** 是否超级管理员 */
  isSuper: boolean;
  /** 权限码列表，超管为 ['*'] */
  permissions: string[];
  /** 角色 id */
  roleId?: string;
}

/**
 * Express 请求对象上我们额外挂的属性。
 * systemId / systemCode 是「本次请求实际操作的子系统」，
 * 超管可以通过请求头 X-System-Code 切换，普通用户永远等于自己所属系统。
 */
export interface RequestWithUser {
  user?: JwtUser;
  systemId?: string;
  systemCode?: string;
  headers: Record<string, any>;
  [key: string]: any;
}

/** 分页查询返回结构 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
