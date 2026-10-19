import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 健康检查接口。
 *
 * 用途：
 *   1. 部署后 / 容器编排用来判断服务是不是活着
 *   2. update.sh 之类的自检脚本用它确认后端起来了
 *
 * 注意：
 *   这个接口不需要登录，也不返回任何敏感信息（不返回数据库地址、账号）。
 */
@ApiTags("健康检查")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/health */
  @Public()
  @Get()
  async health() {
    const db = await this.prisma.health();
    return {
      status: db.db ? "ok" : "degraded",
      time: new Date().toISOString(),
      db: db.db,
      pgvector: db.pgvector,
      ...(db.message ? { message: db.message } : {}),
    };
  }
}
