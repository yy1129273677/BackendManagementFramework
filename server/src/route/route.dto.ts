/**
 * 路由（菜单）相关的请求体。
 *
 * 注意：permissionCode 是历史字段，新页面不再让人手填——
 * 菜单权限改成「角色管理里的权限树勾选」，由 accessType 控制。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** 访问控制：PUBLIC = 登录即可见；ROLE = 需要角色勾选 */
export type RouteAccessType = "PUBLIC" | "ROLE";

export class CreateRouteDto {
  /** 父级路由 id，可空表示顶级菜单 */
  @ApiPropertyOptional({
    description: "父级路由 id，必须是当前子系统下的路由；null 或留空表示顶级菜单",
    type: String,
    nullable: true,
    example: "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  })
  parentId?: string | null;
  /** 菜单显示名 */
  @ApiProperty({ description: "菜单显示名", example: "订单管理" })
  title: string;
  /** 浏览器地址栏里的路径，必须以 / 开头，子系统内唯一 */
  @ApiProperty({
    description: "浏览器地址栏路径：必须以 / 开头，只能包含字母、数字、-、_、/，子系统内唯一",
    pattern: "^/[A-Za-z0-9_\\-/]*$",
    example: "/orders",
  })
  path: string;
  /** CUSTOM = 自己开发的页面；TABLE = 用 TCID 配置出来的表格页 */
  @ApiProperty({
    description: "路由类型：CUSTOM = 自己开发的 vue 页面；TABLE = 用 TCID 配置出来的表格页",
    enum: ["CUSTOM", "TABLE"],
    example: "TABLE",
  })
  type: "CUSTOM" | "TABLE";
  /** 自定义页面的 vue 文件路径，相对 client/src/views，例如 business/examples/demo-table.vue */
  @ApiPropertyOptional({
    description: "自定义页面的 vue 文件路径（相对 client/src/views，必须以 .vue 结尾）；type=CUSTOM 时新建必填",
    pattern: "^[A-Za-z0-9_\\-/]+\\.vue$",
    example: "business/examples/demo-table.vue",
  })
  componentPath?: string;
  /** 表格路由绑定的 TCID */
  @ApiPropertyOptional({
    description: "表格路由绑定的 TCID，必须存在且属于当前子系统；type=TABLE 时必填",
    example: "TDEMOORDERS",
  })
  tcid?: string;
  /** 图标名（Element Plus 图标），前端用图标选择器选 */
  @ApiPropertyOptional({ description: "图标名（Element Plus 图标）", example: "List" })
  icon?: string;
  @ApiPropertyOptional({ description: "排序值，小的在前", example: 10 })
  sort?: number;
  @ApiPropertyOptional({ description: "是否在菜单中显示，默认 true", example: true })
  visible?: boolean;
  /** 访问该菜单需要的权限码（历史字段，保留兼容） */
  @ApiPropertyOptional({
    description: "访问该菜单需要的权限码（历史字段，仅 PUBLIC 路由的老数据还会校验）",
    example: "read",
  })
  permissionCode?: string;
  /** 访问控制，默认 PUBLIC */
  @ApiPropertyOptional({
    description: "访问控制：PUBLIC = 登录即可见；ROLE = 需在角色权限树里勾选该菜单。默认 PUBLIC",
    enum: ["PUBLIC", "ROLE"],
    example: "ROLE",
  })
  accessType?: RouteAccessType;
  /**
   * 注入给前端页面的 JSON 配置。
   * 自定义页面通过 props.routeConfig 拿到它，可以用来放默认筛选值、标题、列宽等。
   * 可以传对象，也可以传 JSON 字符串（后台表单里是文本域）。
   */
  @ApiPropertyOptional({
    description:
      "注入给 CUSTOM 页面 props.routeConfig 的 JSON 配置（对象或 JSON 字符串，上限 20KB）；tcids 声明页面内嵌的表格，必须存在且属于当前子系统",
    type: Object,
    example: { tcids: ["TDEMOORDERS"] },
  })
  config?: any;
}

export class UpdateRouteDto {
  @ApiPropertyOptional({
    description: "父级路由 id，必须是当前子系统下的路由；null 表示顶级菜单",
    type: String,
    nullable: true,
    example: "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  })
  parentId?: string | null;
  @ApiPropertyOptional({ description: "菜单显示名", example: "订单管理" })
  title?: string;
  @ApiPropertyOptional({
    description: "浏览器地址栏路径：必须以 / 开头，只能包含字母、数字、-、_、/，子系统内唯一",
    pattern: "^/[A-Za-z0-9_\\-/]*$",
    example: "/orders",
  })
  path?: string;
  @ApiPropertyOptional({
    description: "路由类型：CUSTOM = 自己开发的 vue 页面；TABLE = 用 TCID 配置出来的表格页",
    enum: ["CUSTOM", "TABLE"],
    example: "TABLE",
  })
  type?: "CUSTOM" | "TABLE";
  @ApiPropertyOptional({
    description: "自定义页面的 vue 文件路径（相对 client/src/views，必须以 .vue 结尾）",
    pattern: "^[A-Za-z0-9_\\-/]+\\.vue$",
    example: "business/examples/demo-table.vue",
  })
  componentPath?: string;
  @ApiPropertyOptional({
    description: "表格路由绑定的 TCID，必须存在且属于当前子系统",
    example: "TDEMOORDERS",
  })
  tcid?: string;
  @ApiPropertyOptional({ description: "图标名（Element Plus 图标）", example: "List" })
  icon?: string;
  @ApiPropertyOptional({ description: "排序值，小的在前", example: 10 })
  sort?: number;
  @ApiPropertyOptional({ description: "是否在菜单中显示", example: true })
  visible?: boolean;
  @ApiPropertyOptional({
    description: "访问该菜单需要的权限码（历史字段，仅 PUBLIC 路由的老数据还会校验）",
    example: "read",
  })
  permissionCode?: string;
  @ApiPropertyOptional({
    description: "访问控制：PUBLIC = 登录即可见；ROLE = 需在角色权限树里勾选该菜单",
    enum: ["PUBLIC", "ROLE"],
    example: "ROLE",
  })
  accessType?: RouteAccessType;
  @ApiPropertyOptional({
    description:
      "注入给 CUSTOM 页面 props.routeConfig 的 JSON 配置（对象或 JSON 字符串，上限 20KB）；tcids 声明页面内嵌的表格，必须存在且属于当前子系统",
    type: Object,
    example: { tcids: ["TDEMOORDERS"] },
  })
  config?: any;
}
