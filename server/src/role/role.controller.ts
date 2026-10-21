import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
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
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能操作自己所属子系统",
  example: "demo",
})
@Controller("roles")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @RequirePermissions("role:read")
  @ApiOperation({ summary: "角色列表", description: "只返回当前子系统的角色，并附带每个角色下的用户数量。" })
  @Get()
  list(@SystemId() systemId: string) {
    return this.roleService.list(systemId);
  }

  /** 权限码清单：给角色编辑页的勾选框用 */
  @RequirePermissions("role:read")
  @ApiOperation({
    summary: "权限码平铺清单",
    description: "返回固定系统功能权限码及分组，老接口保留；菜单与按钮请使用权限树接口。",
  })
  @Get("permissions")
  permissions() {
    return this.roleService.permissions();
  }

  /**
   * 权限树（需求 002）：菜单 + 表格按钮组成一棵树，勾选即授权。
   * 注意要放在 :id 之类的动态路由之前，否则 permission-tree 会被当成 id。
   */
  @RequirePermissions("role:read")
  @ApiOperation({
    summary: "权限树（菜单与按钮）",
    description:
      "返回当前子系统的权限树与 keyMap：系统功能按分组展示；菜单节点下挂 TABLE 菜单的按钮，CUSTOM 页面按 config.tcids 挂内嵌表格的按钮。角色编辑页用它勾选，无需自己拼权限码。",
  })
  @Get("permission-tree")
  permissionTree(@SystemId() systemId: string) {
    return this.roleService.permissionTree(systemId);
  }

  @RequirePermissions("role:create")
  @ApiOperation({
    summary: "新建角色",
    description:
      "角色编码大写字母开头、2~32 位，子系统内唯一；SUPER_ADMIN 为保留编码。权限码只做格式校验，不按固定白名单过滤。",
  })
  @Post()
  create(@SystemId() systemId: string, @Body() dto: CreateRoleDto) {
    return this.roleService.create(systemId, dto);
  }

  @RequirePermissions("role:update")
  @ApiOperation({
    summary: "修改角色",
    description: "角色编码不可修改；超管角色（SUPER_ADMIN）不允许修改；permissions 传入即整体覆盖。",
  })
  @ApiParam({ name: "id", description: "角色 id，必须属于当前子系统", example: "4d7e9f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a" })
  @Patch(":id")
  update(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(systemId, id, dto);
  }

  @RequirePermissions("role:delete")
  @ApiOperation({
    summary: "删除角色",
    description: "超管角色不允许删除；角色下仍有用户时拒绝删除，需先解除用户绑定。",
  })
  @ApiParam({ name: "id", description: "角色 id，必须属于当前子系统", example: "4d7e9f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a" })
  @Delete(":id")
  remove(@SystemId() systemId: string, @Param("id") id: string) {
    return this.roleService.remove(systemId, id);
  }
}
