/**
 * 数据库种子脚本。
 *
 * 干什么：
 *   1. 建主系统 + 超管账号（yy1 / yy1129273677，可用 .env 覆盖）
 *   2. 建一个演示子系统 demo + 演示账号 demo / demo123456
 *   3. 演示子系统里建：字典（订单状态）、一张示例表格配置（TCID = TDEMOORDERS）
 *      并真的把物理表和几条示例数据建出来
 *   4. 建两条示例路由：一条「表格页面」，一条「自定义页面」
 *
 * 运行：
 *   在 server 目录执行 `npm run seed`
 *
 * 注意：
 *   - 这个脚本尽量写成可重复执行的（upsert），重复跑不会炸
 *   - 但示例表格数据只在表为空时才插入，避免每次 seed 都加一堆假数据
 *   - 生产环境首次部署跑一次即可；不要在生产上反复跑
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { DdlService } from "../src/table-config/ddl.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { normalizeCustomActions, normalizeFields, normalizeOperations } from "../src/table-config/table-field.types";

const prisma = new PrismaClient();
const ddl = new DdlService(prisma as unknown as PrismaService);

/** 超管账号（可用环境变量覆盖，默认就是需求里指定的那个） */
const SUPER_USERNAME = process.env.SUPER_ADMIN_USERNAME || "yy1";
const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "yy1129273677";

/** 演示子系统的编码和示例表格 TCID */
const DEMO_SYSTEM_CODE = "demo";
const DEMO_TCID = "TDEMOORDERS";

async function main() {
  console.log("=== 开始初始化数据 ===");

  // ---------- 1. 主系统 + 超管 ----------
  const mainSystem = await prisma.system.upsert({
    where: { code: "main" },
    update: { isMain: true, name: "主系统" },
    create: {
      code: "main",
      name: "主系统",
      isMain: true,
      remark: "超级管理员使用的配置中心",
    },
  });

  const superRole = await prisma.role.upsert({
    where: { systemId_code: { systemId: mainSystem.id, code: "SUPER_ADMIN" } },
    update: { permissions: ["*"] },
    create: {
      systemId: mainSystem.id,
      code: "SUPER_ADMIN",
      name: "超级管理员",
      permissions: ["*"],
      remark: "拥有全部权限，不可删除",
    },
  });

  const superUser = await prisma.user.upsert({
    where: {
      systemId_username: { systemId: mainSystem.id, username: SUPER_USERNAME },
    },
    update: { roleId: superRole.id },
    create: {
      systemId: mainSystem.id,
      username: SUPER_USERNAME,
      passwordHash: await bcrypt.hash(SUPER_PASSWORD, 10),
      nickname: "超级管理员",
      roleId: superRole.id,
    },
  });
  console.log(`✔ 主系统 / 超管账号：${SUPER_USERNAME}`);

  // ---------- 2. 演示子系统 ----------
  const demoSystem = await prisma.system.upsert({
    where: { code: DEMO_SYSTEM_CODE },
    update: {},
    create: {
      code: DEMO_SYSTEM_CODE,
      name: "演示子系统",
      isMain: false,
      remark: "用于演示「配置一下就有后台页面」的子系统",
    },
  });

  const demoRole = await prisma.role.upsert({
    where: { systemId_code: { systemId: demoSystem.id, code: "ADMIN" } },
    update: {},
    create: {
      systemId: demoSystem.id,
      code: "ADMIN",
      name: "演示管理员",
      permissions: [
        "route:read",
        "route:create",
        "route:update",
        "route:delete",
        "user:read",
        "user:create",
        "user:update",
        "user:delete",
        "role:read",
        "role:create",
        "role:update",
        "role:delete",
        "dict:read",
        "dict:manage",
        "table:read",
        "table:create",
        "table:update",
        "table:delete",
        "data:read",
        "data:create",
        "data:update",
        "data:delete",
      ],
      remark: "演示子系统的默认管理员",
    },
  });

  await prisma.user.upsert({
    where: { systemId_username: { systemId: demoSystem.id, username: "demo" } },
    update: { roleId: demoRole.id },
    create: {
      systemId: demoSystem.id,
      username: "demo",
      passwordHash: await bcrypt.hash("demo123456", 10),
      nickname: "演示账号",
      roleId: demoRole.id,
    },
  });
  console.log(`✔ 演示子系统：${DEMO_SYSTEM_CODE} / 演示账号：demo`);

  // ---------- 3. 业务字典：订单状态 ----------
  const dictType = await prisma.dictType.upsert({
    where: { systemId_code: { systemId: demoSystem.id, code: "order_status" } },
    update: {},
    create: {
      systemId: demoSystem.id,
      code: "order_status",
      name: "订单状态",
      remark: "演示用字典",
    },
  });

  const statusItems = [
    { label: "待付款", value: "pending", sort: 1 },
    { label: "已付款", value: "paid", sort: 2 },
    { label: "已发货", value: "shipped", sort: 3 },
    { label: "已取消", value: "cancelled", sort: 4 },
  ];
  for (const item of statusItems) {
    await prisma.dictItem.upsert({
      where: {
        dictTypeId_value: { dictTypeId: dictType.id, value: item.value },
      },
      update: { label: item.label, sort: item.sort },
      create: { dictTypeId: dictType.id, ...item },
    });
  }
  console.log(`✔ 字典：order_status（${statusItems.length} 个选项）`);

  // ---------- 4. 示例表格配置（TCID = TDEMOORDERS）----------
  const fields = normalizeFields([
    {
      name: "order_no",
      label: "订单号",
      type: "string",
      visible: true,
      searchable: true,
      searchOp: "like",
      required: true,
      width: 160,
    },
    {
      name: "customer_name",
      label: "客户名称",
      type: "string",
      visible: true,
      searchable: true,
      searchOp: "like",
      required: true,
      width: 140,
    },
    {
      name: "amount",
      label: "金额",
      type: "number",
      visible: true,
      searchable: true,
      searchOp: "between",
      width: 120,
    },
    {
      name: "status",
      label: "状态",
      type: "string",
      visible: true,
      searchable: true,
      searchOp: "eq",
      options: { dict: "order_status" },
      width: 100,
    },
    {
      name: "is_paid",
      label: "是否付款",
      type: "boolean",
      visible: true,
      searchable: true,
      searchOp: "eq",
      width: 100,
    },
    {
      name: "remark",
      label: "备注",
      type: "text",
      visible: false,
      searchable: false,
      editable: true,
    },
  ]);

  const customActions = normalizeCustomActions([
    {
      label: "标记发货",
      value: "ship",
      permission: "data:update",
      type: "primary",
    },
    { label: "查看详情", value: "detail", type: "default" },
  ]);

  await ddl.createTable(DEMO_TCID, fields);

  const config = await prisma.tableConfig.upsert({
    where: { tcid: DEMO_TCID },
    update: {
      name: "订单列表",
      fields: fields as any,
      operations: normalizeOperations(null) as any,
      customActions: customActions as any,
    },
    create: {
      tcid: DEMO_TCID,
      systemId: demoSystem.id,
      name: "订单列表",
      remark: "演示表格：搜索条件、分页、增删改、自定义按钮都有",
      physicalTable: `biz_${DEMO_TCID.toLowerCase()}`,
      fields: fields as any,
      searchMode: "AND",
      operations: normalizeOperations(null) as any,
      customActions: customActions as any,
      pageSize: 10,
      createdBy: superUser.id,
    },
  });

  // 只在表为空时插入示例数据
  const counted = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT count(*)::int AS count FROM "${config.physicalTable}"`,
  );
  if (Number(counted[0]?.count || 0) === 0) {
    const samples = [
      ["SO20240001", "张三", 199.5, "paid", true, "首单"],
      ["SO20240002", "李四", 88.0, "pending", false, ""],
      ["SO20240003", "王五", 1299.0, "shipped", true, "加急"],
    ];
    for (const row of samples) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${config.physicalTable}" ("order_no","customer_name","amount","status","is_paid","remark")
                 VALUES ($1,$2,$3,$4,$5,$6)`,
        ...row,
      );
    }
    console.log(`✔ 示例表格数据：3 条`);
  } else {
    console.log(`✔ 示例表格数据已存在（${counted[0]?.count} 条），跳过`);
  }
  console.log(`✔ 表格配置：TCID = ${DEMO_TCID}`);

  // ---------- 5. 示例路由 ----------
  await prisma.route.upsert({
    where: { systemId_path: { systemId: demoSystem.id, path: "/order/list" } },
    update: { tcid: DEMO_TCID, type: "TABLE" },
    create: {
      systemId: demoSystem.id,
      title: "订单管理",
      path: "/order/list",
      type: "TABLE",
      tcid: DEMO_TCID,
      icon: "List",
      sort: 1,
      visible: true,
    },
  });

  await prisma.route.upsert({
    where: { systemId_path: { systemId: demoSystem.id, path: "/custom/demo" } },
    update: {},
    create: {
      systemId: demoSystem.id,
      title: "自定义页面示例",
      path: "/custom/demo",
      type: "CUSTOM",
      componentPath: "examples/demo-table.vue",
      icon: "Grid",
      sort: 2,
      visible: true,
    },
  });
  console.log(`✔ 示例路由：/order/list（表格）、/custom/demo（自定义页面）`);

  console.log("\n=== 初始化完成 ===");
  console.log("超管登录：username=" + SUPER_USERNAME + " password=" + SUPER_PASSWORD + " 系统编码留空");
  console.log("演示登录：username=demo password=demo123456 系统编码=" + DEMO_SYSTEM_CODE);
  console.log("示例 TCID：" + DEMO_TCID);
}

main()
  .catch((error) => {
    console.error("初始化失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
