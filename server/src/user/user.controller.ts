import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { CurrentUser, SystemId } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { CreateUserDto, UpdateUserDto } from "./user.dto";
import { UserService } from "./user.service";

/**
 * 用户管理接口。
 * 操作对象永远是「当前上下文子系统」里的用户（超管切换子系统后就是那个系统）。
 */
@ApiTags("用户管理")
@ApiBearerAuth()
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能操作自己所属子系统",
  example: "demo",
})
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /api/users?page=1&pageSize=20&keyword=xxx */
  @RequirePermissions("user:read")
  @ApiOperation({
    summary: "分页查询当前子系统的用户",
    description: "只返回当前上下文子系统的用户；keyword 会同时模糊匹配用户名和昵称。",
  })
  @ApiQuery({ name: "page", required: false, description: "页码，从 1 开始，默认 1", example: 1 })
  @ApiQuery({ name: "pageSize", required: false, description: "每页条数，取值范围 1~200，默认 20", example: 20 })
  @ApiQuery({ name: "keyword", required: false, description: "按用户名或昵称模糊搜索", example: "张三" })
  @Get()
  list(
    @SystemId() systemId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
  ) {
    return this.userService.list(systemId, Number(page) || 1, Number(pageSize) || 20, keyword);
  }

  @RequirePermissions("user:create")
  @ApiOperation({
    summary: "新建用户",
    description:
      "用户名 3~32 位、字母开头且只能包含字母/数字/下划线，同一子系统内唯一；密码至少 6 位。roleId 必须是当前子系统下的角色。",
  })
  @Post()
  create(@SystemId() systemId: string, @Body() dto: CreateUserDto) {
    return this.userService.create(systemId, dto);
  }

  @RequirePermissions("user:update")
  @ApiOperation({
    summary: "修改用户",
    description: "只更新传入的字段；传 password 表示重置密码（至少 6 位）；roleId 传 null 表示解除角色绑定。",
  })
  @ApiParam({ name: "id", description: "用户 id，必须属于当前子系统", example: "8e1f0a2b-4c6d-4e8f-9a0b-1c2d3e4f5a6b" })
  @Patch(":id")
  update(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(systemId, id, dto);
  }

  @RequirePermissions("user:delete")
  @ApiOperation({
    summary: "删除用户",
    description: "不能删除自己；只能删除当前上下文子系统内的用户。",
  })
  @ApiParam({ name: "id", description: "用户 id，必须属于当前子系统", example: "8e1f0a2b-4c6d-4e8f-9a0b-1c2d3e4f5a6b" })
  @Delete(":id")
  remove(@CurrentUser() user: JwtUser, @SystemId() systemId: string, @Param("id") id: string) {
    return this.userService.remove(user, systemId, id);
  }
}
