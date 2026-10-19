/**
 * 需求 002 权限码迁移：把老表的全局 data:create/update/delete 迁成按 TCID 的码。
 *
 * 用法（在 server 目录）：
 *   npm run migrate:002:dry   # 只预览，不改库
 *   npm run migrate:002       # 真正执行（一个事务里改完）
 *
 * 做什么：
 *   1. 表格配置：createPermission/updatePermission/deletePermission 里的全局码 → data:<op>:<tcid>
 *   2. 自定义按钮：permission 正好是全局码的 → data:<op>:<tcid>
 *   3. 角色：全局码 → 所有依赖它的表的按 TCID 码（否则迁移后老角色就没权限了）
 *
 * 安全性：
 *   - 幂等：迁移完再跑一次是"无变化"
 *   - 一个事务：要么全成功，要么全回滚
 *   - 动库前先备份（pg_dump），命令见 DEPLOY.md
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { planPermissionMigration } from "../src/role/permission-migration";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const configs = await prisma.tableConfig.findMany({
    select: { tcid: true, name: true, operations: true, customActions: true },
  });

  const roles = await prisma.role.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      permissions: true,
      system: { select: { code: true } },
    },
  });

  const plan = planPermissionMigration(configs as any, roles as any);
  const roleByCode = new Map(roles.map((role) => [role.id, role]));

  console.log(`=== 权限码迁移 002${dryRun ? "（dry-run，只预览）" : ""} ===`);
  console.log(`表格配置共 ${configs.length} 张，需要改 ${plan.tablesChanged} 张`);
  for (const table of plan.tables.filter((item) => item.changedFields.length > 0)) {
    console.log(`  ${table.tcid}${table.name ? `（${table.name}）` : ""}: ${table.changedFields.join(", ")}`);
  }

  console.log(`角色共 ${roles.length} 个，需要改 ${plan.rolesChanged} 个`);
  for (const role of plan.roles.filter((item) => item.changed)) {
    const systemCode = roleByCode.get(role.id)?.system?.code || "?";
    const removed = role.removed.length > 0 ? `-${role.removed.join(" -")}` : "";
    const added = role.added.length > 0 ? `+${role.added.join(" +")}` : "";
    console.log(`  [${systemCode}] ${role.code}: ${removed} ${added}`.trimEnd());
  }

  console.log(
    `汇总：表格权限码替换 ${plan.codesReplacedInTables} 处；角色移除 ${plan.codesRemovedFromRoles} 个码、新增 ${plan.codesAddedToRoles} 个码`,
  );

  if (plan.tablesChanged === 0 && plan.rolesChanged === 0) {
    console.log("无需迁移（已经是新格式）。");
    return;
  }

  if (dryRun) {
    console.log("\n[dry-run] 没有改库。确认无误后去掉 --dry-run 再跑一次。");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const table of plan.tables.filter((item) => item.changedFields.length > 0)) {
      await tx.tableConfig.update({
        where: { tcid: table.tcid },
        data: {
          operations: table.operations as any,
          customActions: table.customActions as any,
        },
      });
    }

    for (const role of plan.roles.filter((item) => item.changed)) {
      await tx.role.update({
        where: { id: role.id },
        data: { permissions: role.permissions },
      });
    }
  });

  console.log("\n✅ 迁移完成。建议：重新登录相关账号（权限在 token 里），并刷新一次页面。");
}

main()
  .catch((error) => {
    console.error("迁移失败，数据库未改动（事务已回滚）：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
