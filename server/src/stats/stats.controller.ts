import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, SystemId } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { StatsService } from "./stats.service";

/**
 * 首页统计接口（给 ECharts 用）。
 *
 * 路径前缀：/api/stats
 *
 * 权限说明：
 *   - 两个接口都只要求「已登录」，不额外要求权限码：
 *     首页是登录后的落地页，任何能进后台的人都该看到自己系统的概况。
 *   - overview 内部再判断 isSuper，普通用户访问会 403。
 */
@ApiTags("统计")
@ApiBearerAuth()
@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /** 主系统首页：平台总览（仅超管） */
  @Get("overview")
  overview(@CurrentUser() user: JwtUser) {
    return this.statsService.overview(user);
  }

  /** 子系统首页：当前子系统的统计 */
  @Get("system")
  system(@CurrentUser() user: JwtUser, @SystemId() systemId: string) {
    return this.statsService.system(user, systemId);
  }
}
