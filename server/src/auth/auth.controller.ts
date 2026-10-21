import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators";
import { CurrentUser } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { ChangePasswordDto, LoginDto } from "./auth.dto";
import { AuthService } from "./auth.service";

/**
 * 认证接口。
 * 路径前缀统一是 /api（在 main.ts 里设置的全局前缀）。
 */
@ApiTags("认证")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 登录：POST /api/auth/login
   * 不需要 token（@Public），否则就成了「要先登录才能登录」的死循环。
   */
  @Public()
  // 登录是最容易被暴力破解的接口：同一 IP 每分钟最多 5 次，超过返回 429。
  // 注意限流按 IP 计算，所以 main.ts 里必须配置 trust proxy，否则所有用户会共用 Nginx 容器的 IP。
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: "登录（公开接口，无需 token）",
    description:
      "systemCode 留空登录主系统，填子系统编码登录对应子系统；子系统停用或账号停用返回 403。账号不存在与密码错误统一返回「账号或密码错误」，避免用户名枚举。",
  })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * 当前用户信息：GET /api/auth/profile
   * 前端刷新页面后用它恢复登录态。
   */
  @ApiBearerAuth()
  @ApiOperation({
    summary: "获取当前登录用户信息",
    description: "按 token 中的用户 id 查数据库最新状态，前端刷新页面后用它恢复登录态；角色或权限调整后刷新即可生效。",
  })
  @Get("profile")
  profile(@CurrentUser() user: JwtUser) {
    return this.authService.profile(user);
  }

  /**
   * 修改自己的密码：POST /api/auth/password
   */
  @ApiBearerAuth()
  @ApiOperation({
    summary: "修改自己的密码",
    description:
      "必须先通过原密码校验，新密码至少 8 位。修改后已签发的 token 不会在服务端失效，返回提示要求用新密码重新登录。",
  })
  @Post("password")
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }
}
