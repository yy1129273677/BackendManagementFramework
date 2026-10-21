import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { CurrentUser, SystemId } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { CreateRouteDto, UpdateRouteDto } from "./route.dto";
import { RouteService } from "./route.service";

/**
 * 路由（菜单）管理接口。
 * 路径：/api/routes
 */
@ApiTags("路由管理")
@ApiBearerAuth()
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能操作自己所属子系统",
  example: "demo",
})
@Controller("routes")
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  /** 管理页用：当前子系统全部路由 */
  @RequirePermissions("route:read")
  @ApiOperation({
    summary: "当前子系统全部路由",
    description: "管理页使用，包含 visible=false 的隐藏菜单，按 sort 排序。",
  })
  @Get()
  list(@SystemId() systemId: string) {
    return this.routeService.list(systemId);
  }

  /**
   * 前端登录后生成菜单用：只返回「当前用户有权限且未隐藏」的路由。
   * 注意这条不加 route:read 权限要求——普通用户也得能看到自己的菜单。
   */
  @ApiOperation({
    summary: "当前用户可见的路由（生成菜单用）",
    description:
      "只返回 visible=true 且当前用户有权限的路由，不要求 route:read 权限码。ROLE 路由需要在角色权限树里勾选对应菜单，PUBLIC 路由登录即可见。",
  })
  @Get("my")
  my(@CurrentUser() user: JwtUser, @SystemId() systemId: string) {
    return this.routeService.myRoutes(user, systemId);
  }

  @RequirePermissions("route:create")
  @ApiOperation({
    summary: "新建路由",
    description:
      "path 必须以 / 开头且子系统内唯一。CUSTOM 必须填 componentPath（相对 client/src/views 的 .vue 文件）；TABLE 必须绑定存在且属于当前子系统的 TCID。config.tcids 里声明的内嵌表格也会校验归属。",
  })
  @Post()
  create(@SystemId() systemId: string, @Body() dto: CreateRouteDto) {
    return this.routeService.create(systemId, dto);
  }

  @RequirePermissions("route:update")
  @ApiOperation({
    summary: "修改路由",
    description: "未传的字段保持不变；父级菜单与 TCID 必须属于当前子系统；修改 path 时仍需保证子系统内唯一。",
  })
  @ApiParam({ name: "id", description: "路由 id，必须属于当前子系统", example: "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" })
  @Patch(":id")
  update(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateRouteDto) {
    return this.routeService.update(systemId, id, dto);
  }

  @RequirePermissions("route:delete")
  @ApiOperation({
    summary: "删除路由",
    description: "存在子菜单时拒绝删除，需要先删除子菜单；删除后角色里残留的 menu:<routeId> 权限码不会自动清理。",
  })
  @ApiParam({ name: "id", description: "路由 id，必须属于当前子系统", example: "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" })
  @Delete(":id")
  remove(@SystemId() systemId: string, @Param("id") id: string) {
    return this.routeService.remove(systemId, id);
  }
}
