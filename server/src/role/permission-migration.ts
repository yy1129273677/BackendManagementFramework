/**
 * 需求 002 权限码迁移：把「老表的全局权限码」迁成「按 TCID 的权限码」。
 *
 * 背景：
 *   需求 002 之前，表格的增删改权限码是全局的 data:create / data:update / data:delete，
 *   结果 A 表和 B 表共用同一个码，权限树里也会和「系统功能」里的同名项"看起来重复"。
 *   新方案是按表隔离：data:create:<tcid>。
 *
 * 为什么单独抽成纯函数：
 *   迁移是一次性的、但要能反复验证的脏活。抽成纯函数后可以：
 *     1. 写单测覆盖各种边界（data:read 不能动、自定义按钮共用的码、幂等）
 *     2. 先 dry-run 打印"将要改什么"，确认后再真正落库
 *     3. 脚本丢了也能从逻辑上重建
 *
 * 迁移规则（只动这三类全局码，data:read 等控制器级权限保持不动）：
 *   1. 表格配置 operations 里 createPermission/updatePermission/deletePermission
 *      如果正好是 data:create / data:update / data:delete → 换成 data:<op>:<tcid>
 *   2. 表格自定义按钮的 permission 如果正好是这三个全局码 → 同样换成 data:<op>:<tcid>
 *   3. 角色 permissions 里的这三个全局码 → 换成「所有用到该全局码的表」对应的按 TCID 码
 *      （否则迁移后老角色就失去权限，表现为按钮全点不了）
 *
 * 幂等：第二次跑时表格里已经没有全局码了，角色里也换完了，plan 会是"无变化"。
 */

/** 会被迁移的全局操作码 */
const GLOBAL_OPERATIONS = ["create", "update", "delete"] as const;
type OperationKey = (typeof GLOBAL_OPERATIONS)[number];

/** 需要迁移的全局权限码 */
function parseGlobalOperation(code: string): OperationKey | null {
  if (code === "data:create") return "create";
  if (code === "data:update") return "update";
  if (code === "data:delete") return "delete";
  return null;
}

export interface MigrationTableConfig {
  tcid: string;
  name?: string;
  operations?: any;
  customActions?: any;
}

export interface MigrationRole {
  id: string;
  code: string;
  name?: string;
  permissions?: string[];
}

export interface TableMigrationResult {
  tcid: string;
  name?: string;
  operations: any;
  customActions: any[];
  /** 被改的字段，例如 ["createPermission", "action:ship"]，空数组表示这张表不用改 */
  changedFields: string[];
}

export interface RoleMigrationResult {
  id: string;
  code: string;
  name?: string;
  permissions: string[];
  added: string[];
  removed: string[];
  changed: boolean;
}

export interface MigrationPlan {
  tables: TableMigrationResult[];
  roles: RoleMigrationResult[];
  /** 有改动的表数量 */
  tablesChanged: number;
  /** 有改动的角色数量 */
  rolesChanged: number;
  /** 表格里被换掉的权限码个数 */
  codesReplacedInTables: number;
  /** 角色里新增 / 移除的码总数 */
  codesAddedToRoles: number;
  codesRemovedFromRoles: number;
}

/**
 * 计算迁移方案（不落库）。
 *
 * 参数：
 *   configs - 所有表格配置（跨子系统也要一起传，tcid 是全局唯一的）
 *   roles   - 所有角色（跨子系统）
 */
export function planPermissionMigration(configs: MigrationTableConfig[], roles: MigrationRole[]): MigrationPlan {
  /** op → 之前用全局码的那些表的 tcid 集合 */
  const tablesUsingGlobalOp = new Map<OperationKey, Set<string>>();

  let codesReplacedInTables = 0;

  const tableResults: TableMigrationResult[] = configs.map((config) => {
    const operations = { ...(config.operations || {}) };
    const changedFields: string[] = [];

    for (const op of GLOBAL_OPERATIONS) {
      const field = `${op}Permission`;
      if (operations[field] === `data:${op}`) {
        operations[field] = `data:${op}:${config.tcid}`;
        changedFields.push(field);
        codesReplacedInTables += 1;

        if (!tablesUsingGlobalOp.has(op)) tablesUsingGlobalOp.set(op, new Set());
        tablesUsingGlobalOp.get(op)!.add(config.tcid);
      }
    }

    const rawActions = Array.isArray(config.customActions) ? config.customActions : [];
    const customActions = rawActions.map((action: any) => {
      const permission = action?.permission ? String(action.permission) : "";
      const op = permission ? parseGlobalOperation(permission) : null;
      if (!op) return action;

      changedFields.push(`action:${String(action?.value ?? "")}`);
      codesReplacedInTables += 1;

      if (!tablesUsingGlobalOp.has(op)) tablesUsingGlobalOp.set(op, new Set());
      tablesUsingGlobalOp.get(op)!.add(config.tcid);

      return { ...action, permission: `data:${op}:${config.tcid}` };
    });

    return {
      tcid: config.tcid,
      name: config.name,
      operations,
      customActions,
      changedFields,
    };
  });

  let codesAddedToRoles = 0;
  let codesRemovedFromRoles = 0;

  const roleResults: RoleMigrationResult[] = roles.map((role) => {
    const original = role.permissions || [];
    const next: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];

    for (const code of original) {
      const op = parseGlobalOperation(code);

      // 不是全局操作码：原样保留（包括 data:read、route:read、menu:<id> 等）
      if (!op) {
        if (!next.includes(code)) next.push(code);
        continue;
      }

      // 全局操作码：移除，换成所有曾经依赖它的表的按 TCID 码
      removed.push(code);
      codesRemovedFromRoles += 1;

      const tcids = tablesUsingGlobalOp.get(op);
      if (!tcids || tcids.size === 0) continue; // 没有表在用这个全局码了：直接删掉

      for (const tcid of tcids) {
        const nextCode = `data:${op}:${tcid}`;
        if (!original.includes(nextCode) && !next.includes(nextCode)) {
          next.push(nextCode);
          added.push(nextCode);
          codesAddedToRoles += 1;
        }
      }
    }

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      permissions: next,
      added,
      removed,
      changed: added.length > 0 || removed.length > 0,
    };
  });

  return {
    tables: tableResults,
    roles: roleResults,
    tablesChanged: tableResults.filter((table) => table.changedFields.length > 0).length,
    rolesChanged: roleResults.filter((role) => role.changed).length,
    codesReplacedInTables,
    codesAddedToRoles,
    codesRemovedFromRoles,
  };
}
