import { JwtUser } from "../common/types";

/**
 * 把「数据库里的用户行」转成 JWT 里承载的用户信息（每次请求都重新算）。
 *
 * 为什么要单独抽出来：
 *   以前 token 里的权限是**登录那一刻的快照**，改了角色权限必须重新登录才生效，
 *   使用体验很差（用户要求：改完权限刷新页面就该生效）。
 *   现在 token 只负责证明「你是谁」，权限在每次请求时用这个函数从库里重新算。
 *
 * 这个函数是纯函数（不查库），方便单测覆盖「超管判定 / 权限取哪个角色 / 禁用用户」这些规则。
 */
export interface DbUserForJwt {
  id: string;
  username: string;
  nickname?: string | null;
  systemId: string;
  roleId?: string | null;
  status?: number | null;
  role?: {
    code?: string | null;
    name?: string | null;
    permissions?: string[] | null;
  } | null;
  system?: {
    code?: string | null;
    isMain?: boolean | null;
  } | null;
}

/**
 * 生成最新的用户信息。
 *
 * 规则：
 *   - 只有「主系统 + SUPER_ADMIN 角色」才算超管，超管权限固定为 ['*']
 *   - 其他用户取所属角色的权限码（角色被改，下一次请求就能拿到新权限）
 *
 * @param dbUser 数据库查询结果（含 role / system 关联）
 * @returns 挂到 request.user 上的对象
 */
export function toJwtUser(dbUser: DbUserForJwt): JwtUser {
  const isSuper = Boolean(dbUser.system?.isMain) && dbUser.role?.code === "SUPER_ADMIN";

  return {
    sub: dbUser.id,
    username: dbUser.username,
    nickname: dbUser.nickname || dbUser.username,
    systemId: dbUser.systemId,
    systemCode: String(dbUser.system?.code || ""),
    isSuper,
    // 超管固定通配；普通用户永远取角色上的最新权限
    permissions: isSuper ? ["*"] : dbUser.role?.permissions || [],
    roleId: dbUser.roleId || undefined,
  };
}

/**
 * 判断这个用户还能不能登录/继续访问。
 * 目前只有一种情况要拦：账号被禁用（status !== 1）或已被删除。
 */
export function isUserActive(dbUser: DbUserForJwt | null | undefined): dbUser is DbUserForJwt {
  if (!dbUser) return false;
  return (dbUser.status ?? 1) === 1;
}
