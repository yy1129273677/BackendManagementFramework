import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
  @Get()
  list() {
    return this.systemService.list();
  }

  /** 新建子系统（会自动附送默认管理员角色） */
  @RequirePermissions("system:manage")
  @Post()
  create(@Body() dto: CreateSystemDto) {
    return this.systemService.create(dto);
  }

  /** 修改子系统 */
  @RequirePermissions("system:manage")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSystemDto) {
    return this.systemService.update(id, dto);
  }

  /** 删除子系统（⚠️ 会连带删除该系统的所有配置和业务数据表，不可恢复） */
  @RequirePermissions("system:manage")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.systemService.remove(id);
  }
}
