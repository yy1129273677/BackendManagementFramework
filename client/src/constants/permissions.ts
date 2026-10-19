/**
 * 权限码清单（前端用）。
 *
 * ⚠️ 必须和后端 server/src/common/constants.ts 里的 ALL_PERMISSIONS 保持一致。
 * 这份清单只用于「角色编辑页画勾选框」和「前端控制按钮显不显示」，
 * 真正的权限拦截一定在后端做——前端隐藏按钮只是体验，不是安全措施。
 */
export interface PermissionItem {
  code: string;
  name: string;
  group: string;
}

export const ALL_PERMISSIONS: PermissionItem[] = [
  {
    code: "system:manage",
    name: "子系统管理（新建/修改/删除子系统）",
    group: "主系统",
  },

  { code: "route:read", name: "查看路由", group: "路由" },
  { code: "route:create", name: "新建路由", group: "路由" },
  { code: "route:update", name: "修改路由", group: "路由" },
  { code: "route:delete", name: "删除路由", group: "路由" },

  { code: "user:read", name: "查看用户", group: "用户" },
  { code: "user:create", name: "新建用户", group: "用户" },
  { code: "user:update", name: "修改用户", group: "用户" },
  { code: "user:delete", name: "删除用户", group: "用户" },

  { code: "role:read", name: "查看角色", group: "角色" },
  { code: "role:create", name: "新建角色", group: "角色" },
  { code: "role:update", name: "修改角色", group: "角色" },
  { code: "role:delete", name: "删除角色", group: "角色" },

  { code: "dict:read", name: "查看业务字典", group: "字典" },
  { code: "dict:manage", name: "维护业务字典", group: "字典" },

  { code: "table:read", name: "查看表格配置", group: "表格配置" },
  {
    code: "table:create",
    name: "新建表格配置（生成 TCID）",
    group: "表格配置",
  },
  { code: "table:update", name: "修改表格配置", group: "表格配置" },
  { code: "table:delete", name: "删除表格配置", group: "表格配置" },

  { code: "data:read", name: "读取表格数据", group: "表格数据" },
  { code: "data:create", name: "新增表格数据", group: "表格数据" },
  { code: "data:update", name: "修改表格数据", group: "表格数据" },
  { code: "data:delete", name: "删除表格数据", group: "表格数据" },
];

/** 按分组整理，角色编辑页按组分栏展示 */
export const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map((item) => item.group))];
