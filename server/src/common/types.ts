/**
 * 通用类型定义。
 */

/**
 * JWT 里承载的用户信息（登录时签进去，之后每个请求都解出来）。
 *
 * 说明：
 *   权限是「登录那一刻」的快照，改了角色权限后需要重新登录才生效。
 *   这是有意的取舍：每个请求都查数据库会让性能变差，而权限变更不频繁。
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
