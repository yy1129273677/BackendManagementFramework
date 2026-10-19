import { http } from "./request";

/**
 * 所有后端接口的封装。
 *
 * 为什么集中在一个文件：
 *   接口路径是前后端契约，集中放一处，改路径时只改这里，
 *   也方便对照 server/README.md 里的 API 一览表。
 *
 * 统一约定：
 *   - 后端返回已经被 request.ts 拆过包装，这里直接是业务数据
 *   - 分页接口返回 { list, total, page, pageSize }
 */

/** 认证 */
export const authApi = {
  /** 登录：systemCode 留空 = 主系统 */
  login: (data: { username: string; password: string; systemCode?: string }) =>
    http<{ token: string; user: any }>({
      url: "/auth/login",
      method: "post",
      data,
    }),

  /** 当前登录用户信息 */
  profile: () => http<any>({ url: "/auth/profile" }),

  /** 修改自己的密码 */
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http({ url: "/auth/password", method: "post", data }),
};

/** 子系统（租户）*/
export const systemApi = {
  list: () => http<{ list: any[] }>({ url: "/systems" }),
  create: (data: { code: string; name: string; remark?: string }) => http({ url: "/systems", method: "post", data }),
  update: (id: string, data: { name?: string; remark?: string; status?: number }) =>
    http({ url: `/systems/${id}`, method: "patch", data }),
  remove: (id: string) => http({ url: `/systems/${id}`, method: "delete" }),
};

/** 路由（菜单）*/
export const routeApi = {
  list: () => http<{ list: any[] }>({ url: "/routes" }),
  my: () => http<{ list: any[] }>({ url: "/routes/my" }),
  create: (data: any) => http({ url: "/routes", method: "post", data }),
  update: (id: string, data: any) => http({ url: `/routes/${id}`, method: "patch", data }),
  remove: (id: string) => http({ url: `/routes/${id}`, method: "delete" }),
};

/** 用户 */
export const userApi = {
  list: (params: { page?: number; pageSize?: number; keyword?: string }) =>
    http<{ list: any[]; total: number }>({ url: "/users", params }),
  create: (data: any) => http({ url: "/users", method: "post", data }),
  update: (id: string, data: any) => http({ url: `/users/${id}`, method: "patch", data }),
  remove: (id: string) => http({ url: `/users/${id}`, method: "delete" }),
};

/** 角色 */
export const roleApi = {
  list: () => http<{ list: any[] }>({ url: "/roles" }),
  permissions: () => http<{ list: any[]; groups: string[] }>({ url: "/roles/permissions" }),
  create: (data: any) => http({ url: "/roles", method: "post", data }),
  update: (id: string, data: any) => http({ url: `/roles/${id}`, method: "patch", data }),
  remove: (id: string) => http({ url: `/roles/${id}`, method: "delete" }),
};

/** 业务字典 */
export const dictApi = {
  types: () => http<{ list: any[] }>({ url: "/dict/types" }),
  createType: (data: any) => http({ url: "/dict/types", method: "post", data }),
  updateType: (id: string, data: any) => http({ url: `/dict/types/${id}`, method: "patch", data }),
  removeType: (id: string) => http({ url: `/dict/types/${id}`, method: "delete" }),
  items: (id: string) => http<{ list: any[]; dictType: any }>({ url: `/dict/types/${id}/items` }),
  itemsByCode: (code: string) =>
    http<{ code: string; name: string; items: any[] }>({
      url: `/dict/by-code/${code}`,
    }),
  createItem: (data: any) => http({ url: "/dict/items", method: "post", data }),
  updateItem: (id: string, data: any) => http({ url: `/dict/items/${id}`, method: "patch", data }),
  removeItem: (id: string) => http({ url: `/dict/items/${id}`, method: "delete" }),
};

/** 表格配置（TCID）*/
export const tableConfigApi = {
  list: (keyword?: string) => http<{ list: any[] }>({ url: "/table-configs", params: { keyword } }),
  detail: (tcid: string) => http<any>({ url: `/table-configs/${tcid}` }),
  create: (data: any) => http<any>({ url: "/table-configs", method: "post", data }),
  update: (tcid: string, data: any) => http<any>({ url: `/table-configs/${tcid}`, method: "put", data }),
  remove: (tcid: string) => http({ url: `/table-configs/${tcid}`, method: "delete" }),
};

/** 表格数据（公用 Table 组件用的就是这几个）*/
export const tableDataApi = {
  /** 渲染配置：列、搜索项、按钮、当前用户能做哪些操作 */
  config: (tcid: string) => http<any>({ url: `/table/${tcid}/config` }),
  /** 分页查询，filters 需要传 JSON 字符串 */
  list: (tcid: string, params: { page: number; pageSize: number; filters?: string }) =>
    http<{ list: any[]; total: number }>({
      url: `/table/${tcid}/data`,
      params,
    }),
  create: (tcid: string, data: any) => http({ url: `/table/${tcid}/data`, method: "post", data }),
  update: (tcid: string, id: string, data: any) => http({ url: `/table/${tcid}/data/${id}`, method: "patch", data }),
  remove: (tcid: string, id: string) => http({ url: `/table/${tcid}/data/${id}`, method: "delete" }),
};

/** 健康检查 */
export const healthApi = {
  check: () => http<any>({ url: "/health" }),
};
