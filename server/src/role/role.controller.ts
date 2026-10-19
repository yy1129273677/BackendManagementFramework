import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { SystemId } from "../common/param-decorators";
import { CreateRoleDto, UpdateRoleDto } from "./role.dto";
import { RoleService } from "./role.service";

/**
 * 角色管理接口。
 * 路径：/api/roles
 */
@ApiTags("角色管理")
@ApiBearerAuth()
@Controller("roles")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @RequirePermissions("role:read")
  @Get()
  list(@SystemId() systemId: string) {
    return this.roleService.list(systemId);
  }

  /** 权限码清单：给角色编辑页的勾选框用 */
  @RequirePermissions("role:read")
  @Get("permissions")
  permissions() {
    return this.roleService.permissions();
  }

  @RequirePermissions("role:create")
  @Post()
  create(@SystemId() systemId: string, @Body() dto: CreateRoleDto) {
    return this.roleService.create(systemId, dto);
  }

  @RequirePermissions("role:update")
  @Patch(":id")
  update(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(systemId, id, dto);
  }

  @RequirePermissions("role:delete")
  @Delete(":id")
  remove(@SystemId() systemId: string, @Param("id") id: string) {
    return this.roleService.remove(systemId, id);
  }
}
