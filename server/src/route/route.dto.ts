/**
 * 路由（菜单）相关的请求体。
 *
 * 注意：permissionCode 是历史字段，新页面不再让人手填——
 * 菜单权限改成「角色管理里的权限树勾选」，由 accessType 控制。
 */

/** 访问控制：PUBLIC = 登录即可见；ROLE = 需要角色勾选 */
export type RouteAccessType = "PUBLIC" | "ROLE";

export class CreateRouteDto {
  /** 父级路由 id，可空表示顶级菜单 */
  parentId?: string | null;
  /** 菜单显示名 */
  title: string;
  /** 浏览器地址栏里的路径，必须以 / 开头，子系统内唯一 */
  path: string;
  /** CUSTOM = 自己开发的页面；TABLE = 用 TCID 配置出来的表格页 */
  type: "CUSTOM" | "TABLE";
  /** 自定义页面的 vue 文件路径，相对 client/src/views，例如 examples/demo-table.vue */
  componentPath?: string;
  /** 表格路由绑定的 TCID */
  tcid?: string;
  /** 图标名（Element Plus 图标），前端用图标选择器选 */
  icon?: string;
  sort?: number;
  visible?: boolean;
  /** 访问该菜单需要的权限码（历史字段，保留兼容） */
  permissionCode?: string;
  /** 访问控制，默认 PUBLIC */
  accessType?: RouteAccessType;
  /**
   * 注入给前端页面的 JSON 配置。
   * 自定义页面通过 props.routeConfig 拿到它，可以用来放默认筛选值、标题、列宽等。
   * 可以传对象，也可以传 JSON 字符串（后台表单里是文本域）。
   */
  config?: any;
}

export class UpdateRouteDto {
  parentId?: string | null;
  title?: string;
  path?: string;
  type?: "CUSTOM" | "TABLE";
  componentPath?: string;
  tcid?: string;
  icon?: string;
  sort?: number;
  visible?: boolean;
  permissionCode?: string;
  accessType?: RouteAccessType;
  config?: any;
}
