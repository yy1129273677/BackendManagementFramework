/**
 * 需求 005 数据范围迁移：给所有业务物理表补 created_by 列。
 *
 * 用法（在 server 目录）：
 *   npm run migrate:003:dry   # 只预览，不改库
 *   npm run migrate:003       # 真正执行
 *
 * 背景：
 *   物理表是运行时按 TCID 动态创建的，不在 Prisma schema 里，
 *   所以「加固定列」没法写进 prisma migrate，只能用脚本逐表 ALTER。
 *
 * 做什么：
 *   1. 遍历 sys_table_config，拿到每张表的物理表名（biz_<tcid>）
 *   2. ALTER TABLE ... ADD COLUMN IF NOT EXISTS "created_by" uuid
 *   3. 建 created_by 索引（仅本人查询会用到）
 *
 * 安全性：
 *   - 幂等：ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 *   - 只做加法，不删列、不改类型
 *   - 表名由 physicalTableName 生成并校验过，不会拼进用户输入
 *   - 历史数据 created_by 为 NULL：读范围为 OWN 时只有超管/查看全部权限可见
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { physicalTableName } from "../src/common/identifiers";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const configs = await prisma.tableConfig.findMany({
    select: { tcid: true, name: true },
    orderBy: { tcid: "asc" },
  });

  console.log(`=== 业务表 created_by 迁移 003${dryRun ? "（dry-run，只预览）" : ""} ===`);
  console.log(`表格配置共 ${configs.length} 张`);

  let done = 0;
  for (const config of configs) {
    const table = physicalTableName(config.tcid);
    const indexName = `idx_${table}_created_by`;
    const columnSql = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "created_by" uuid`;
    const indexSql = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" ("created_by")`;

    if (dryRun) {
      console.log(`  [预览] ${config.tcid}${config.name ? `（${config.name}）` : ""}: ${columnSql}; ${indexSql}`);
      continue;
    }

    await prisma.$executeRawUnsafe(columnSql);
    await prisma.$executeRawUnsafe(indexSql);
    done += 1;
    console.log(`  ${config.tcid}${config.name ? `（${config.name}）` : ""}: 已补 created_by`);
  }

  console.log(dryRun ? "预览完成，未改动数据库" : `迁移完成，共处理 ${done} 张表`);
}

main()
  .catch((error) => {
    console.error("迁移失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
