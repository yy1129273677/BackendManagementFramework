/**
 * 路由（菜单）相关的请求体。
 */

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
  icon?: string;
  sort?: number;
  visible?: boolean;
  /** 访问该菜单需要的权限码，可空 */
  permissionCode?: string;
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
}
