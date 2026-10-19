import { planPermissionMigration } from "./permission-migration";

/**
 * 权限码迁移逻辑的单测。
 *
 * 重点验证：
 *   1. 只迁 create/update/delete 三个全局码，data:read / route:read 等不能动
 *   2. 角色里的全局码要换成「所有用过该码的表」的按 TCID 码（否则迁移完权限就没了）
 *   3. 自定义按钮如果复用了全局码，也要迁
 *   4. 幂等：迁完再跑一次，plan 必须是无变化
 */
describe("planPermissionMigration 权限码迁移", () => {
  it("老表的三条全局操作码迁成按 TCID 的码", () => {
    const plan = planPermissionMigration(
      [
        {
          tcid: "TORDER",
          name: "订单列表",
          operations: {
            create: true,
            update: true,
            delete: true,
            createPermission: "data:create",
            updatePermission: "data:update",
            deletePermission: "data:delete",
          },
          customActions: [],
        },
      ],
      [],
    );

    expect(plan.tablesChanged).toBe(1);
    expect(plan.codesReplacedInTables).toBe(3);

    const table = plan.tables[0];
    expect(table.operations.createPermission).toBe("data:create:TORDER");
    expect(table.operations.updatePermission).toBe("data:update:TORDER");
    expect(table.operations.deletePermission).toBe("data:delete:TORDER");
    expect(table.changedFields).toEqual(["createPermission", "updatePermission", "deletePermission"]);
  });

  it("data:read 等控制器级全局权限码不能被迁移", () => {
    const plan = planPermissionMigration(
      [
        {
          tcid: "TA",
          operations: { create: true, createPermission: "data:read" },
          customActions: [],
        },
      ],
      [{ id: "r1", code: "ADMIN", permissions: ["data:read", "route:read", "menu:xxx"] }],
    );

    expect(plan.tablesChanged).toBe(0);
    expect(plan.rolesChanged).toBe(0);
    expect(plan.roles[0].permissions).toEqual(["data:read", "route:read", "menu:xxx"]);
  });

  it("角色里的全局码换成所有依赖它的表的按 TCID 码", () => {
    const plan = planPermissionMigration(
      [
        {
          tcid: "TA",
          operations: { create: true, createPermission: "data:create" },
          customActions: [],
        },
        {
          tcid: "TB",
          operations: { create: true, createPermission: "data:create" },
          customActions: [],
        },
        {
          tcid: "TC",
          // 新表：已经是按 TCID 的码，不应该被角色迁移带上
          operations: { create: true, createPermission: "data:create:TC" },
          customActions: [],
        },
      ],
      [{ id: "r1", code: "ADMIN", permissions: ["data:read", "data:create"] }],
    );

    const role = plan.roles[0];
    expect(role.permissions).toContain("data:read");
    expect(role.permissions).toContain("data:create:TA");
    expect(role.permissions).toContain("data:create:TB");
    expect(role.permissions).not.toContain("data:create:TC"); // 新表本来就不依赖全局码
    expect(role.permissions).not.toContain("data:create");
    expect(role.removed).toEqual(["data:create"]);
    expect(role.added.sort()).toEqual(["data:create:TA", "data:create:TB"]);
  });

  it("自定义按钮复用了全局码时也要迁移", () => {
    const plan = planPermissionMigration(
      [
        {
          tcid: "TORDER",
          operations: { update: true, updatePermission: "data:update" },
          customActions: [
            { label: "标记发货", value: "ship", permission: "data:update" },
            { label: "查看详情", value: "detail", permission: "detail" },
            { label: "无权限按钮", value: "free" },
          ],
        },
      ],
      [{ id: "r1", code: "ADMIN", permissions: ["data:update"] }],
    );

    const table = plan.tables[0];
    expect(table.customActions[0].permission).toBe("data:update:TORDER");
    expect(table.customActions[1].permission).toBe("detail"); // 自定义码不动
    expect(table.customActions[2].permission).toBeUndefined(); // 没配码的按钮不动
    expect(table.changedFields).toContain("action:ship");
    expect(table.changedFields).not.toContain("action:detail");
  });

  it("幂等：迁移完再算一次 plan 应该是无变化", () => {
    const migratedConfigs = [
      {
        tcid: "TORDER",
        operations: {
          create: true,
          createPermission: "data:create:TORDER",
          update: true,
          updatePermission: "data:update:TORDER",
          delete: true,
          deletePermission: "data:delete:TORDER",
        },
        customActions: [{ label: "标记发货", value: "ship", permission: "data:update:TORDER" }],
      },
    ];
    const migratedRoles = [
      {
        id: "r1",
        code: "ADMIN",
        permissions: ["data:read", "data:create:TORDER", "data:update:TORDER", "data:delete:TORDER"],
      },
    ];

    const plan = planPermissionMigration(migratedConfigs, migratedRoles);
    expect(plan.tablesChanged).toBe(0);
    expect(plan.rolesChanged).toBe(0);
    expect(plan.codesReplacedInTables).toBe(0);
    expect(plan.codesAddedToRoles).toBe(0);
  });

  it("角色里有全局码但已经没有表在用时，直接移除该死码", () => {
    const plan = planPermissionMigration(
      [{ tcid: "TA", operations: { create: true, createPermission: "data:create:TA" }, customActions: [] }],
      [{ id: "r1", code: "ADMIN", permissions: ["data:delete"] }],
    );

    expect(plan.roles[0].permissions).toEqual([]);
    expect(plan.roles[0].removed).toEqual(["data:delete"]);
  });

  it("角色同时有全局码和目标码时不重复添加", () => {
    const plan = planPermissionMigration(
      [{ tcid: "TA", operations: { create: true, createPermission: "data:create" }, customActions: [] }],
      [{ id: "r1", code: "ADMIN", permissions: ["data:create", "data:create:TA"] }],
    );

    const permissions = plan.roles[0].permissions;
    expect(permissions.filter((code) => code === "data:create:TA")).toHaveLength(1);
    expect(permissions).not.toContain("data:create");
  });
});
