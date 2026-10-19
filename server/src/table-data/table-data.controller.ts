import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
@Controller("table")
export class TableDataController {
  constructor(private readonly service: TableDataService) {}

  /** 渲染配置：<Table :tcid="xxx" /> 一进页面就先调这个 */
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
