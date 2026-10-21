import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CurrentUser, SystemId } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { TableDataService } from "./table-data.service";

/**
 * 动态表格数据接口 —— 前端公用组件 <Table> 调的就是这里。
 *
 * 路径规律：/api/table/:tcid/xxx
 *   GET    /api/table/:tcid/config      渲染配置（列、搜索项、按钮、权限）
 *   GET    /api/table/:tcid/data        分页 + 搜索
 *   POST   /api/table/:tcid/data        新增
 *   PATCH  /api/table/:tcid/data/:id    修改
 *   DELETE /api/table/:tcid/data/:id    删除
 *
 * 注意：
 *   接口本身不区分是哪张表，全靠 tcid 去读配置。
 *   所以新增一张业务表 = 在后台配一次，不需要加接口、不需要发版。
 */
@ApiTags("表格数据（按 TCID）")
@ApiBearerAuth()
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能访问自己所属子系统",
  example: "demo",
})
@ApiHeader({
  name: "X-Route-Id",
  required: false,
  description: "当前前端动态路由 id，用于按路由判断新增/修改/删除按钮权限；不传时只认老的基础权限码",
  example: "9f3c2a1b-4d5e-4a6b-8c7d-0e1f2a3b4c5d",
})
@Controller("table")
export class TableDataController {
  constructor(private readonly service: TableDataService) {}

  /** 渲染配置：<Table :tcid="xxx" /> 一进页面就先调这个 */
  @ApiOperation({
    summary: "获取表格渲染配置",
    description:
      "返回列、搜索项、操作按钮和当前用户可执行的操作。读取前会校验读权限：需要勾选绑定了该表的菜单，CUSTOM 页面则按 config.tcids 声明放行；老角色残留的全局 data:read 仍兼容。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，必须存在且属于当前子系统", example: "TDEMOORDERS" })
  @Get(":tcid/config")
  config(
    @SystemId() systemId: string,
    @Param("tcid") tcid: string,
    @CurrentUser() user: JwtUser,
    @Headers("x-route-id") routeId?: string,
  ) {
    return this.service.renderConfig(systemId, tcid, user, routeId);
  }

  /**
   * 列表查询。
   * filters 是 JSON 字符串，形如：
   *   {"conditions":[{"field":"status","op":"eq","value":"paid"}]}
   * CUSTOM 模式下可以传 group 做任意 AND/OR/NOT 嵌套。
   *
   * 读权限不再用全局 data:read 卡：能不能读这张表由「对应菜单有没有勾」决定，
   * 具体判断在 TableDataService.assertCanReadTable（纯函数有单测）。
   */
  @ApiOperation({
    summary: "分页查询表格数据",
    description:
      'filters 是结构化条件组的 JSON 字符串，不是原始 SQL WHERE。格式：{"conditions":[{"field":"status","op":"eq","value":"paid"}]}；CUSTOM 模式下可用 {"mode":"CUSTOM","group":{"logic":"OR","not":false,"conditions":[...],"groups":[...]}} 做任意 AND/OR/NOT 嵌套。op 支持 eq/ne/like/notLike/gt/gte/lt/lte/in/notIn/between/isNull/notNull；field 必须是配置里 searchable=true 的字段。不需要全局 data:read，勾选对应菜单即可读。',
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，必须存在且属于当前子系统", example: "TDEMOORDERS" })
  @ApiQuery({ name: "page", required: false, description: "页码，从 1 开始，默认 1", example: 1 })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "每页条数，取值范围 1~200；不传时使用表格配置的 pageSize，再兜底 20",
    example: 20,
  })
  @ApiQuery({
    name: "filters",
    required: false,
    description:
      '结构化搜索条件的 JSON 字符串，例如 {"conditions":[{"field":"status","op":"eq","value":"paid"}]}；不是原始 SQL WHERE',
    example: '{"conditions":[{"field":"status","op":"eq","value":"paid"}]}',
  })
  @Get(":tcid/data")
  list(
    @SystemId() systemId: string,
    @Param("tcid") tcid: string,
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("filters") filters?: string,
  ) {
    return this.service.query(systemId, tcid, { page, pageSize, filters }, user);
  }

  @ApiOperation({
    summary: "新增一条数据",
    description:
      "只写入配置里 editable 的字段；required 字段为空返回 400。需要表格开启新增且当前用户具备权限码（按 X-Route-Id 区分路由）。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，必须存在且属于当前子系统", example: "TDEMOORDERS" })
  @Post(":tcid/data")
  create(
    @SystemId() systemId: string,
    @Param("tcid") tcid: string,
    @CurrentUser() user: JwtUser,
    @Body() body: Record<string, any>,
    @Headers("x-route-id") routeId?: string,
  ) {
    return this.service.create(systemId, tcid, user, body, routeId);
  }

  @ApiOperation({
    summary: "修改一条数据",
    description:
      "只修改传入且 editable 的字段；没有可修改字段返回 400，数据不存在返回 404。需要表格开启修改且当前用户具备权限码（按 X-Route-Id 区分路由）。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，必须存在且属于当前子系统", example: "TDEMOORDERS" })
  @ApiParam({ name: "id", description: "数据行 id，必须是 uuid 格式", example: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" })
  @Patch(":tcid/data/:id")
  update(
    @SystemId() systemId: string,
    @Param("tcid") tcid: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtUser,
    @Body() body: Record<string, any>,
    @Headers("x-route-id") routeId?: string,
  ) {
    return this.service.update(systemId, tcid, id, user, body, routeId);
  }

  @ApiOperation({
    summary: "删除一条数据",
    description:
      "id 必须是 uuid 格式，数据不存在返回 404。需要表格开启删除且当前用户具备权限码（按 X-Route-Id 区分路由）。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，必须存在且属于当前子系统", example: "TDEMOORDERS" })
  @ApiParam({ name: "id", description: "数据行 id，必须是 uuid 格式", example: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" })
  @Delete(":tcid/data/:id")
  remove(
    @SystemId() systemId: string,
    @Param("tcid") tcid: string,
    @Param("id") id: string,
    @CurrentUser() user: JwtUser,
    @Headers("x-route-id") routeId?: string,
  ) {
    return this.service.remove(systemId, tcid, id, user, routeId);
  }
}
