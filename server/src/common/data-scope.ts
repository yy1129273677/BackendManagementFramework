import { hasRouteScopedPermission } from "./permission-scope";

/**
 * 表级数据范围（行级隔离）。
 *
 * 背景（用户 2026-10-21）：
 *   本框架原来只有「系统/租户之间」的隔离——同一张表在同一系统里是全员共享的。
 *   真实业务常常需要「各自看各自创建的」或「大家互相看、但只能改自己的」，
 *   所以给表格配置增加两个独立开关：
 *     read_scope  : ALL（全系统可见）/ OWN（仅创建人可见）
 *     write_scope : ALL（有修改权限即可改所有行）/ OWN（只能改自己创建的行）
 *
 * 例外：
 *   - 超管始终能看到、修改所有行（含切换前没有创建人的历史数据）
 *   - 读范围为 OWN 时，命中 `data:viewAll:<tcid>` 权限的用户也能看全部
 *     （权限码同样支持路由级 `:route:<routeId>` 后缀）
 */
export type DataScope = "ALL" | "OWN";

/** 允许配置的数据范围值 */
export const DATA_SCOPE_VALUES: DataScope[] = ["ALL", "OWN"];

/**
 * 规范化数据范围配置。
 *
 * 规则：
 *   - 不传 / null / 空字符串 → 用 fallback（默认 ALL，保证老表行为不变）
 *   - 只认 ALL / OWN（大小写不敏感），其它值直接报错，避免拼错后静默变成全开
 */
export function normalizeDataScope(input: unknown, fallback: DataScope = "ALL"): DataScope {
  if (input === undefined || input === null || input === "") return fallback;
  const value = String(input).trim().toUpperCase();
  if (value !== "ALL" && value !== "OWN") {
    throw new Error('数据范围只能是 "ALL"（全部）或 "OWN"（仅本人）');
  }
  return value;
}

/** 「查看全部数据」的权限码（按 TCID，权限树会再加 :route:<routeId> 后缀） */
export function viewAllPermissionCode(tcid: string): string {
  return `data:viewAll:${tcid}`;
}

export interface DataScopeOptions {
  /** 表配置里的读范围 */
  readScope?: string | null;
  /** 表配置里的写范围 */
  writeScope?: string | null;
  tcid: string;
  isSuper: boolean;
  permissions?: string[] | null;
  routeId?: string | null;
}

export interface EffectiveDataScope {
  /** 能看所有人的数据（true = 不加 created_by 过滤） */
  readAll: boolean;
  /** 能改/删所有人的数据（true = 不加 created_by 过滤） */
  writeAll: boolean;
  /** 是否命中「查看全部数据」权限（仅读范围 OWN 时才有意义） */
  viewAll: boolean;
}

/**
 * 算出当前用户在这张表上的实际数据范围。
 *
 * 注意：这里只算「范围」，不判断用户有没有读这张表 / 有没有增删改权限——
 * 那些仍由 read-access 与 operations 权限码负责，两者是「与」的关系。
 */
export function resolveDataScope(options: DataScopeOptions): EffectiveDataScope {
  const viewAll = hasRouteScopedPermission(
    options.permissions || [],
    false,
    viewAllPermissionCode(options.tcid),
    options.routeId,
  );

  return {
    // 只有明确配置成 OWN 才限制；ALL / 空值都按全员可见处理
    readAll: Boolean(options.isSuper) || options.readScope !== "OWN" || viewAll,
    writeAll: Boolean(options.isSuper) || options.writeScope !== "OWN",
    viewAll,
  };
}
