import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";

/**
 * pgvector 预留能力。
 *
 * 干什么：
 *   当前版本只提供「检查环境」和「看有多少条待检索文档」两个只读接口。
 *   真正的语义检索（把自然语言转成向量再去库里找相似内容）需要再接一个
 *   embedding 模型，属于下一阶段。
 *
 * 为什么现在就把扩展装上：
 *   向量检索要建 vector 列和索引，事后加扩展需要停机迁移；
 *   一开始就启用，以后接 AI 搜索时不用动现有表结构。
 */
@ApiTags("向量检索（预留）")
@ApiBearerAuth()
@Controller("vector")
export class VectorController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/vector/status —— 环境自检，部署后可以调一下确认 pgvector 装好了 */
  @Get("status")
  async status() {
    const extension = await this.prisma.$queryRaw<Array<{ extversion: string }>>`
            SELECT extversion FROM pg_extension WHERE extname = 'vector'
        `;
    const counted = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT count(*)::int AS count FROM sys_vector_document
        `;

    return {
      pgvectorInstalled: extension.length > 0,
      pgvectorVersion: extension[0]?.extversion || null,
      dimension: 1024,
      documentCount: Number(counted[0]?.count || 0),
      note: "预留能力：已建好 vector 扩展与 sys_vector_document 表，尚未接入 embedding 模型",
    };
  }
}
