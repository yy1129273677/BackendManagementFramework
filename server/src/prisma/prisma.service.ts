import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 数据库客户端封装。
 *
 * 干什么：
 *   应用启动时连接数据库，关闭时断开连接。
 *   其它代码通过构造函数注入 PrismaService，就能用 prisma.user.findMany() 这类方法。
 *
 * 注意：
 *   启动时连接失败不会让进程崩掉，只打一条日志——
 *   这样 `nestjs` 进程能起来，Swagger 文档还能看，方便排查网络/账号问题。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Prisma");

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log("数据库连接成功");
    } catch (error) {
      this.logger.error(`数据库连接失败：${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * 检查数据库是否可用 + pgvector 扩展是否装好。
   * 给 /api/health 用。
   */
  async health(): Promise<{
    db: boolean;
    pgvector: boolean;
    message?: string;
  }> {
    try {
      await this.$queryRaw`SELECT 1`;
      const rows = await this.$queryRaw<Array<{ count: bigint }>>`
                SELECT count(*)::int AS count
                FROM pg_extension
                WHERE extname = 'vector'
            `;
      return { db: true, pgvector: Number(rows[0]?.count || 0) > 0 };
    } catch (error) {
      return { db: false, pgvector: false, message: (error as Error).message };
    }
  }
}
