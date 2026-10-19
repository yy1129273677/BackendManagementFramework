import { Prisma } from "@prisma/client";
import { TableField } from "../table-config/table-field.types";

/**
 * 搜索条件 DSL —— 把前端传来的搜索条件翻译成安全的 SQL WHERE 片段。
 *
 * 为什么不用原始 SQL：
 *   「自定义语句」如果允许用户直接写 WHERE 字符串，等于把 SQL 注入的钥匙交给超管，
 *   还容易写出全表扫描的慢查询。这里改成一个**结构化条件组**：
 *
 *     { mode: 'CUSTOM', group: { logic: 'OR', conditions: [
 *         { field: 'amount', op: 'gt', value: 100 },
 *         { field: 'status', op: 'in', value: ['paid', 'shipped'] },
 *     ]}}
 *
 *   它能表达任意 AND/OR/NOT 嵌套，和手写 SQL 的表达能力一样，
 *   但字段名必须来自表格配置、运算符必须来自白名单、值全部走参数绑定。
 *
 * 分两层：
 *   parseSearchPayload()  → 纯数据校验，不碰数据库（好写单测）
 *   toSql()               → 把校验结果拼成 Prisma.Sql（值全部参数化）
 */

/** 单条条件 */
export interface RawCondition {
  field?: string;
  op?: string;
  value?: any;
}

/** 条件组，支持嵌套 */
export interface RawGroup {
  logic?: string;
  not?: boolean;
  conditions?: RawCondition[];
  groups?: RawGroup[];
}

/** 前端传过来的整包搜索条件 */
export interface RawSearchPayload {
  mode?: string;
  conditions?: RawCondition[];
  group?: RawGroup;
}

/** 解析后的条件 */
export interface ParsedCondition {
  field: string;
  op: string;
  /** 实际参与 SQL 的值（已做类型转换） */
  values: any[];
}

/** 解析后的条件组 */
export interface ParsedGroup {
  logic: "AND" | "OR";
  not: boolean;
  children: Array<ParsedCondition | ParsedGroup>;
}

/** 允许的运算符 */
const OPS = new Set([
  "eq",
  "ne",
  "like",
  "notLike",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "between",
  "isNull",
  "notNull",
]);

/** 只有文本类字段能用模糊匹配 */
const TEXT_TYPES = new Set(["string", "text"]);
/** 只有数字/日期类字段能用区间 */
const RANGE_TYPES = new Set(["number", "integer", "date", "datetime"]);

/**
 * 转义 LIKE 里的特殊符号。
 *
 * 干什么：
 *   用户在搜索框里输入 "%" 时，如果他只是想搜「百分号」这个字符，
 *   不转义就会被 SQL 当成通配符，搜出一堆无关数据。
 */
export function escapeLike(value: string): string {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * 把值转成字段类型对应的 JS 类型。
 *
 * 异常：
 *   数字字段传了 "abc" 会抛错（中文提示），而不是悄悄变成 NaN 去查库。
 */
function coerceValue(field: TableField, raw: any): any {
  if (raw === null || raw === undefined) return null;

  switch (field.type) {
    case "number":
    case "integer": {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`字段「${field.label || field.name}」需要数字，收到「${raw}」`);
      }
      return field.type === "integer" ? Math.trunc(value) : value;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const text = String(raw).toLowerCase();
      if (["true", "1", "yes", "y"].includes(text)) return true;
      if (["false", "0", "no", "n"].includes(text)) return false;
      throw new Error(`字段「${field.label || field.name}」需要布尔值`);
    }
    default:
      return String(raw);
  }
}

/**
 * 解析单条条件。返回 null 表示这条条件应该被忽略（比如前端留空的输入框）。
 *
 * 异常：
 *   字段不在配置里、字段不允许搜索、运算符不认识、值格式不对 —— 全部抛出中文错误。
 */
function parseCondition(raw: RawCondition, fieldMap: Map<string, TableField>): ParsedCondition | null {
  if (!raw || typeof raw !== "object") return null;

  const fieldName = String(raw.field || "");
  const field = fieldMap.get(fieldName);
  if (!field) {
    throw new Error(`字段「${fieldName}」不在表格配置里，不能用于搜索`);
  }
  // 只有配置成「可搜索」的字段才允许出现在查询里，避免有人拿隐藏字段做侧信道探测
  if (field.searchable !== true) {
    throw new Error(`字段「${field.label || field.name}」未开启搜索`);
  }

  const op = String(raw.op || "eq");
  if (!OPS.has(op)) {
    throw new Error(`搜索方式「${op}」不支持`);
  }

  // 空值直接忽略：用户打开了搜索框但没填内容，这是最常见的情况
  if (raw.value === undefined || raw.value === null || raw.value === "") {
    if (op !== "isNull" && op !== "notNull") return null;
  }

  switch (op) {
    case "like":
    case "notLike": {
      if (!TEXT_TYPES.has(field.type)) {
        throw new Error(`字段「${field.label || field.name}」是 ${field.type} 类型，不支持模糊搜索`);
      }
      return { field: fieldName, op, values: [escapeLike(String(raw.value))] };
    }
    case "in":
    case "notIn": {
      const list = Array.isArray(raw.value)
        ? raw.value
        : String(raw.value)
            .split(",")
            .map((item) => item.trim());
      const values = list
        .filter((item) => item !== "" && item !== undefined && item !== null)
        .map((item) => coerceValue(field, item));
      if (values.length === 0) return null;
      return { field: fieldName, op, values };
    }
    case "between": {
      if (!RANGE_TYPES.has(field.type)) {
        throw new Error(`字段「${field.label || field.name}」是 ${field.type} 类型，不支持区间搜索`);
      }
      if (!Array.isArray(raw.value) || raw.value.length !== 2) {
        throw new Error(`字段「${field.label || field.name}」的区间搜索需要两个值（起、止）`);
      }
      const [start, end] = raw.value;
      if (start === "" || end === "" || start === null || end === null || start === undefined || end === undefined) {
        return null;
      }
      return {
        field: fieldName,
        op,
        values: [coerceValue(field, start), coerceValue(field, end)],
      };
    }
    case "isNull":
    case "notNull":
      return { field: fieldName, op, values: [] };
    default:
      return { field: fieldName, op, values: [coerceValue(field, raw.value)] };
  }
}

/** 解析一个条件组（递归） */
function parseGroup(raw: RawGroup, fieldMap: Map<string, TableField>, defaultLogic: "AND" | "OR"): ParsedGroup | null {
  const logic = String(raw.logic || defaultLogic).toUpperCase() === "OR" ? "OR" : "AND";
  const children: Array<ParsedCondition | ParsedGroup> = [];

  for (const condition of raw.conditions || []) {
    const parsed = parseCondition(condition, fieldMap);
    if (parsed) children.push(parsed);
  }
  for (const group of raw.groups || []) {
    if (!group || typeof group !== "object") continue;
    const parsed = parseGroup(group, fieldMap, logic);
    if (parsed) children.push(parsed);
  }

  if (children.length === 0) return null;
  return { logic, not: Boolean(raw.not), children };
}

/**
 * 解析整包搜索条件。
 *
 * 参数：
 *   payload     - 前端传来的对象（来自 filters 参数，已 JSON.parse）
 *   fields      - 表格配置里的全部字段
 *   defaultMode - 表格配置的 searchMode：AND / OR / CUSTOM
 *
 * 返回：
 *   解析后的条件组；没有任何有效条件时返回 null（表示不加 WHERE，查全部）
 *
 * 注意：
 *   mode = CUSTOM 时才认 group 结构；AND/OR 模式只认 conditions 平铺数组，
 *   这样超管在后台改搜索模式就能立刻改变所有调用方的行为。
 */
export function parseSearchPayload(
  payload: RawSearchPayload | null | undefined,
  fields: TableField[],
  defaultMode = "AND",
): ParsedGroup | null {
  const fieldMap = new Map<string, TableField>();
  for (const field of fields || []) {
    fieldMap.set(field.name, field);
  }

  const mode = String(payload?.mode || defaultMode || "AND").toUpperCase();

  if (mode === "CUSTOM") {
    const group = payload?.group;
    if (!group || typeof group !== "object") {
      // 允许退化成平铺条件，仍然按 AND 处理
      if (!payload?.conditions?.length) return null;
      return parseGroup({ logic: "AND", conditions: payload.conditions }, fieldMap, "AND");
    }
    return parseGroup(group, fieldMap, "AND");
  }

  const logic: "AND" | "OR" = mode === "OR" ? "OR" : "AND";
  if (!payload?.conditions?.length) return null;

  return parseGroup({ logic, conditions: payload.conditions }, fieldMap, logic);
}

/** 单条条件 → SQL 片段（值全部参数化） */
function conditionToSql(condition: ParsedCondition): Prisma.Sql {
  // 字段名在 parse 阶段已经确认来自配置，且配置入库前经过 isValidIdentifier 校验，
  // 所以这里用 Prisma.raw 拼列名是安全的（表名列名无法参数化，只能这样）
  const column = Prisma.raw(`"${condition.field}"`);
  const [first, second] = condition.values;

  switch (condition.op) {
    case "eq":
      return Prisma.sql`${column} = ${first}`;
    case "ne":
      return Prisma.sql`${column} <> ${first}`;
    case "like":
      return Prisma.sql`${column} ILIKE ${`%${first}%`}`;
    case "notLike":
      return Prisma.sql`${column} NOT ILIKE ${`%${first}%`}`;
    case "gt":
      return Prisma.sql`${column} > ${first}`;
    case "gte":
      return Prisma.sql`${column} >= ${first}`;
    case "lt":
      return Prisma.sql`${column} < ${first}`;
    case "lte":
      return Prisma.sql`${column} <= ${first}`;
    case "in":
      return Prisma.sql`${column} IN (${Prisma.join(condition.values)})`;
    case "notIn":
      return Prisma.sql`${column} NOT IN (${Prisma.join(condition.values)})`;
    case "between":
      return Prisma.sql`${column} BETWEEN ${first} AND ${second}`;
    case "isNull":
      return Prisma.sql`${column} IS NULL`;
    case "notNull":
      return Prisma.sql`${column} IS NOT NULL`;
    default:
      throw new Error(`搜索方式「${condition.op}」不支持`);
  }
}

/**
 * 解析结果 → Prisma.Sql。
 *
 * 返回的片段可以直接塞进 WHERE，例如：
 *   SELECT * FROM biz_xxx WHERE ${toSql(node)}
 */
export function toSql(node: ParsedCondition | ParsedGroup): Prisma.Sql {
  if (!("children" in node)) {
    return conditionToSql(node as ParsedCondition);
  }

  const group = node as ParsedGroup;
  const separator = group.logic === "OR" ? " OR " : " AND ";
  const joined = Prisma.join(
    group.children.map((child) => toSql(child)),
    separator,
  );
  return group.not ? Prisma.sql`NOT (${joined})` : Prisma.sql`(${joined})`;
}

/** 把搜索条件转成完整的 WHERE 片段；没有条件时返回 Prisma.empty（拼进 SQL 就是空字符串） */
export function buildWhereClause(
  payload: RawSearchPayload | null | undefined,
  fields: TableField[],
  defaultMode = "AND",
): Prisma.Sql {
  const parsed = parseSearchPayload(payload, fields, defaultMode);
  if (!parsed) return Prisma.empty;
  return Prisma.sql`WHERE ${toSql(parsed)}`;
}
