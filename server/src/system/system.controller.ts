import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { CreateSystemDto, UpdateSystemDto } from "./system.dto";
import { SystemService } from "./system.service";

/**
 * 子系统管理接口（只有超管能用）。
 * 路径：/api/systems
 */
@ApiTags("子系统管理")
@ApiBearerAuth()
@Controller("systems")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  /** 列出所有子系统 */
  @RequirePermissions("system:manage")
  @ApiOperation({
    summary: "列出全部子系统",
    description: "只有超管可调用；主系统排在最前，并附带每个系统的用户、路由、表格数量。",
  })
  @Get()
  list() {
    return this.systemService.list();
  }

  /** 新建子系统（会自动附送默认管理员角色） */
  @RequirePermissions("system:manage")
  @ApiOperation({
    summary: "新建子系统",
    description:
      "系统编码创建后不可修改，且不能使用保留编码 main。创建成功后会同时生成一个默认管理员角色 ADMIN（带一套常用权限）。",
  })
  @Post()
  create(@Body() dto: CreateSystemDto) {
    return this.systemService.create(dto);
  }

  /** 修改子系统 */
  @RequirePermissions("system:manage")
  @ApiOperation({ summary: "修改子系统", description: "系统编码不可修改，只更新传入的名称、备注、状态字段。" })
  @ApiParam({ name: "id", description: "子系统 id", example: "2f5a7c9e-1b3d-4e6f-8a0b-2c4d6e8f0a1b" })
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSystemDto) {
    return this.systemService.update(id, dto);
  }

  /** 删除子系统（⚠️ 会连带删除该系统的所有配置和业务数据表，不可恢复） */
  @RequirePermissions("system:manage")
  @ApiOperation({
    summary: "删除子系统（不可恢复）",
    description:
      "主系统不允许删除。会连带删除该系统下的用户、角色、路由、表格配置，并 DROP 对应的物理业务表，数据不可恢复。",
  })
  @ApiParam({ name: "id", description: "子系统 id", example: "2f5a7c9e-1b3d-4e6f-8a0b-2c4d6e8f0a1b" })
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.systemService.remove(id);
  }
}
