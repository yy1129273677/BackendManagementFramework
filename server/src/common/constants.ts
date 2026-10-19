/**
 * 全局常量与权限清单。
 *
 * 干什么：
 *   把「权限码」集中定义在一处，前后端、数据库种子、路由守卫都引用同一份清单，
 *   避免出现「后端认 data:read、前端写 data:view」这种对不上的低级错误。
 *
 * 注意：
 *   新增权限码后要同步 3 个地方：
 *   1. 本文件 ALL_PERMISSIONS
 *   2. 前端 client/src/constants/permissions.ts（用于角色勾选界面）
 *   3. docs/design/05-rules.md 的权限矩阵表
 */

/** 标记某个接口不需要登录（反射元数据 key） */
export const IS_PUBLIC_KEY = 'bmf:isPublic'

/** 接口需要的权限码（反射元数据 key） */
export const PERMISSIONS_KEY = 'bmf:permissions'

/** 主系统（超管所在的系统）固定编码 */
export const MAIN_SYSTEM_CODE = 'main'

/** 超级管理员角色编码 */
export const SUPER_ROLE_CODE = 'SUPER_ADMIN'

/** 超管登录后拿到的通配权限，代表「全部权限」 */
export const WILDCARD_PERMISSION = '*'

/** 系统内置的物理表前缀：一个 TCID 对应一张 biz_xxx 表 */
export const BIZ_TABLE_PREFIX = 'biz_'

/** 物理表里自带的固定列（不参与用户字段配置） */
export const BASE_COLUMNS = ['id', 'created_at', 'updated_at'] as const

/**
 * 全部权限码清单。
 * 每项包含 code（程序用）和 name（给人在页面上看）。
 */
export const ALL_PERMISSIONS: Array<{ code: string; name: string; group: string }> = [
    {code: 'system:manage', name: '子系统管理（新建/修改/删除子系统）', group: '主系统'},

    {code: 'route:read', name: '查看路由', group: '路由'},
    {code: 'route:create', name: '新建路由', group: '路由'},
    {code: 'route:update', name: '修改路由', group: '路由'},
    {code: 'route:delete', name: '删除路由', group: '路由'},

    {code: 'user:read', name: '查看用户', group: '用户'},
    {code: 'user:create', name: '新建用户', group: '用户'},
    {code: 'user:update', name: '修改用户', group: '用户'},
    {code: 'user:delete', name: '删除用户', group: '用户'},

    {code: 'role:read', name: '查看角色', group: '角色'},
    {code: 'role:create', name: '新建角色', group: '角色'},
    {code: 'role:update', name: '修改角色', group: '角色'},
    {code: 'role:delete', name: '删除角色', group: '角色'},

    {code: 'dict:read', name: '查看业务字典', group: '字典'},
    {code: 'dict:manage', name: '维护业务字典（新增/修改/删除）', group: '字典'},

    {code: 'table:read', name: '查看表格配置', group: '表格配置'},
    {code: 'table:create', name: '新建表格配置（生成 TCID）', group: '表格配置'},
    {code: 'table:update', name: '修改表格配置', group: '表格配置'},
    {code: 'table:delete', name: '删除表格配置', group: '表格配置'},

    {code: 'data:read', name: '读取表格数据', group: '表格数据'},
    {code: 'data:create', name: '新增表格数据', group: '表格数据'},
    {code: 'data:update', name: '修改表格数据', group: '表格数据'},
    {code: 'data:delete', name: '删除表格数据', group: '表格数据'},
]
