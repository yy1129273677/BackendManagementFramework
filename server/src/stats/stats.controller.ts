import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
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
  @ApiOperation({
    summary: "平台总览统计（仅超管）",
    description:
      "返回子系统总数/启用数、全平台用户/角色/路由/表格/字典计数、各子系统资源对比和近 7 天新增用户趋势；非超管调用返回 403。",
  })
  @Get("overview")
  overview(@CurrentUser() user: JwtUser) {
    return this.statsService.overview(user);
  }

  /** 子系统首页：当前子系统的统计 */
  @ApiOperation({
    summary: "当前子系统统计",
    description:
      "返回本系统的用户/角色/路由/表格/字典计数、各业务表数据量 Top 10、角色用户分布和近 7 天新增用户/业务数据趋势；普通用户只能看自己所属子系统。",
  })
  @ApiHeader({
    name: "X-System-Code",
    required: false,
    description: "超管切换到目标子系统的系统编码；普通用户只能使用自己所属子系统",
    example: "demo",
  })
  @Get("system")
  system(@CurrentUser() user: JwtUser, @SystemId() systemId: string) {
    return this.statsService.system(user, systemId);
  }
}
