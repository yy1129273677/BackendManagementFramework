import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

/**
 * 统计模块：首页 ECharts 数据来源。
 * 依赖 PrismaModule（全局模块），不需要额外导入。
 */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
