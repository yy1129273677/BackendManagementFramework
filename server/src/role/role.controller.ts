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

  /**
   * 权限树（需求 002）：菜单 + 表格按钮组成一棵树，勾选即授权。
   * 注意要放在 :id 之类的动态路由之前，否则 permission-tree 会被当成 id。
   */
  @RequirePermissions("role:read")
  @Get("permission-tree")
  permissionTree(@SystemId() systemId: string) {
    return this.roleService.permissionTree(systemId);
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
