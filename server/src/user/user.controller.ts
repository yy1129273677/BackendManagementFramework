import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /api/users?page=1&pageSize=20&keyword=xxx */
  @RequirePermissions("user:read")
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
  @Post()
  create(@SystemId() systemId: string, @Body() dto: CreateUserDto) {
    return this.userService.create(systemId, dto);
  }

  @RequirePermissions("user:update")
  @Patch(":id")
  update(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(systemId, id, dto);
  }

  @RequirePermissions("user:delete")
  @Delete(":id")
  remove(@CurrentUser() user: JwtUser, @SystemId() systemId: string, @Param("id") id: string) {
    return this.userService.remove(user, systemId, id);
  }
}
