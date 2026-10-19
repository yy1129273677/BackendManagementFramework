import { isValidIdentifier } from "../common/identifiers";

/**
 * 表格字段的类型定义与校验。
 *
 * 这是「配置即建表」的核心数据结构：
 *   超管在页面上加一行字段，这里把它规范成数据库列 + 前端渲染规则。
 */

/** 支持的字段类型（每种对应一个 PostgreSQL 类型 + 一个前端控件） */
export type FieldType = "string" | "text" | "number" | "integer" | "boolean" | "date" | "datetime" | "json";

/** 支持的搜索方式 */
export type SearchOp =
  | "eq"
  | "ne"
  | "like"
  | "notLike"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notIn"
  | "between"
  | "isNull"
  | "notNull";

/** 字段定义（存进 sys_table_config.fields 的 JSON） */
export interface TableField {
  /** 数据库列名，同时是接口字段名：小写字母开头，只含小写字母/数字/下划线 */
  name: string;
  /** 中文标签，表格表头和表单里显示 */
  label: string;
  /** 字段类型 */
  type: FieldType;
  /** 是否在表格里显示这一列 */
  visible?: boolean;
  /** 是否作为搜索条件 */
  searchable?: boolean;
  /** 该字段默认的搜索方式 */
  searchOp?: SearchOp;
  /** 是否允许在新增/编辑表单里修改 */
  editable?: boolean;
  /** 是否必填（在接口层校验，数据库列允许为空，便于加字段） */
  required?: boolean;
  /** 列宽（px），不填自动 */
  width?: number;
  /** 自定义单元格插槽名：前端用 #col-<name> 或配置里指定的名字接管渲染 */
  slot?: string;
  /** 选项来源：字典编码或静态选项，用于下拉框 */
  options?: {
    /** 引用 sys_dict_type 里的字典编码 */
    dict?: string;
    /** 写死的选项 */
    static?: Array<{ label: string; value: string }>;
  };
  /** 排序，小的在前 */
  sort?: number;
  /** 列表显示排序（小的在前）；不填则沿用 sort */
  listSort?: number;
  /** 搜索栏里的排序（小的在前） */
  searchSort?: number;
  /** 表单里的排序；不填默认与 listSort 相同 */
  formSort?: number;
  /** 是否在新增/编辑表单里显示 */
  formVisible?: boolean;
  /** 表单里占几列（24 栅格制）：24 = 整行，12 = 一半，8 = 三等分 */
  formSpan?: number;
  /** 表单校验规则（正则 / 自定义校验器名） */
  rules?: FormFieldRules;
}

/**
 * 表单字段的校验规则。
 *
 * 为什么自定义校验只存「名字」而不是存 JS 代码：
 *   配置存在数据库里，如果允许存一段可执行 JS，就等于给后台开了任意代码执行的口子。
 *   所以这里只存校验器名字，真正的函数放前端源码 client/src/components/table/validators.ts，
 *   开发者注册一次，配置里按名字引用。函数能拿到 (value, formModel)，所以联动校验也没问题。
 */
export interface FormFieldRules {
  /** 正则表达式（字符串形式，后端会校验能否编译） */
  pattern?: string;
  /** 校验失败时的提示文案 */
  message?: string;
  /** 自定义校验器名字（前端 validators.ts 里注册） */
  validator?: string;
}

/** 自定义操作按钮（渲染在每行操作列里） */
export interface CustomAction {
  /** 按钮文字 */
  label: string;
  /** 按钮标识，前端用 #action-<value> 插槽接管点击逻辑 */
  value: string;
  /** 需要什么权限才能看到/点击 */
  permission?: string;
  /** 按钮样式 */
  type?: "primary" | "success" | "warning" | "danger" | "default";
  /** 点击前是否弹确认框 */
  confirm?: boolean;
}

/** 操作列的权限与开关 */
export interface TableOperations {
  create?: boolean;
  update?: boolean;
  delete?: boolean;
  /** 三个操作各自需要的权限码，默认 data:create / data:update / data:delete */
  createPermission?: string;
  updatePermission?: string;
  deletePermission?: string;
}

/** 字段类型 → PostgreSQL 列类型 */
const SQL_TYPE_MAP: Record<FieldType, string> = {
  string: "text",
  text: "text",
  number: "numeric(18,2)",
  integer: "integer",
  boolean: "boolean",
  date: "date",
  datetime: "timestamptz",
  json: "jsonb",
};

/** 所有合法类型，用于校验 */
const ALL_FIELD_TYPES = Object.keys(SQL_TYPE_MAP) as FieldType[];

/** 所有合法搜索方式 */
export const ALL_SEARCH_OPS: SearchOp[] = [
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
];

/** 每种字段类型默认的搜索方式（前端新建字段时预填） */
export function defaultSearchOp(type: FieldType): SearchOp {
  if (type === "string" || type === "text") return "like";
  if (type === "number" || type === "integer" || type === "date" || type === "datetime") return "between";
  return "eq";
}

/** 字段类型对应的数据库列类型 */
export function sqlTypeFor(type: FieldType): string {
  return SQL_TYPE_MAP[type] || "text";
}

/** 判断字符串是不是支持的字段类型 */
export function isFieldType(value: string): value is FieldType {
  return ALL_FIELD_TYPES.includes(value as FieldType);
}

/** 判断字符串是不是支持的搜索方式 */
export function isSearchOp(value: string): value is SearchOp {
  return ALL_SEARCH_OPS.includes(value as SearchOp);
}

/** 自定义校验器名字的合法格式 */
const VALIDATOR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

/**
 * 规范化表单占宽（24 栅格制）。
 * 24 = 整行，12 = 一半，8 = 三等分；非法值一律退回 24，避免前端布局炸掉。
 */
export function normalizeFormSpan(value: any): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 24;
  return Math.min(24, Math.max(1, Math.round(number)));
}

/**
 * 规范化表单校验规则。
 *
 * 校验点：
 *   - pattern 必须是能编译的正则（存的是字符串，编译失败会让前端直接报错，不如在这里拦）
 *   - validator 只能起个合法的函数名（真正的函数在前端源码里注册）
 *   - 两个都没传就返回 undefined，避免数据库里塞一堆空对象
 */
export function normalizeFieldRules(input: any, fieldName: string): FormFieldRules | undefined {
  if (!input || typeof input !== "object") return undefined;

  const pattern =
    input.pattern === undefined || input.pattern === null || input.pattern === "" ? undefined : String(input.pattern);
  const message = input.message ? String(input.message) : undefined;
  const validator =
    input.validator === undefined || input.validator === null || input.validator === ""
      ? undefined
      : String(input.validator);

  if (pattern) {
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch {
      throw new Error(`字段「${fieldName}」的校验正则不合法：${pattern}`);
    }
  }
  if (validator && !VALIDATOR_NAME_PATTERN.test(validator)) {
    throw new Error(`字段「${fieldName}」的自定义校验器名不合法：只能字母/数字/下划线，且不能以数字开头`);
  }

  if (!pattern && !validator) return undefined;
  return { pattern, message, validator };
}

/**
 * 规范化字段列表。
 *
 * 干什么：
 *   1. 校验每个字段名能不能安全地当数据库列名（防注入的第一道门）
 *   2. 补默认值（visible / searchable / editable / sort ...）
 *   3. 去重（同名只保留第一个）
 *   4. 按 sort 排序
 *
 * 异常：
 *   字段名非法、类型不支持、字段为空时抛出中文 Error，由 controller 转成 400。
 */
export function normalizeFields(input: unknown): TableField[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("表格至少需要一个字段");
  }
  if (input.length > 60) {
    throw new Error("单张表格最多 60 个字段，字段太多建议拆表");
  }

  const seen = new Set<string>();
  const fields: TableField[] = [];

  input.forEach((raw: any, index: number) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`第 ${index + 1} 个字段格式不对`);
    }
    const name = String(raw.name || "").trim();
    if (!isValidIdentifier(name)) {
      throw new Error(`字段名「${name}」不合法：只能小写字母开头，包含小写字母、数字、下划线，且不能是数据库关键字`);
    }
    if (seen.has(name)) {
      throw new Error(`字段名「${name}」重复了`);
    }
    seen.add(name);

    const type = String(raw.type || "string") as FieldType;
    if (!isFieldType(type)) {
      throw new Error(`字段「${name}」的类型「${raw.type}」不支持`);
    }

    const searchOp =
      raw.searchOp && isSearchOp(String(raw.searchOp)) ? (raw.searchOp as SearchOp) : defaultSearchOp(type);
    const label = String(raw.label || name).trim() || name;

    const listSort = Number.isFinite(Number(raw.listSort))
      ? Number(raw.listSort)
      : Number.isFinite(Number(raw.sort))
        ? Number(raw.sort)
        : index;

    fields.push({
      name,
      label,
      type,
      visible: raw.visible === undefined ? true : Boolean(raw.visible),
      searchable: Boolean(raw.searchable),
      searchOp,
      editable: raw.editable === undefined ? true : Boolean(raw.editable),
      required: Boolean(raw.required),
      width: raw.width ? Number(raw.width) : undefined,
      slot: raw.slot ? String(raw.slot) : undefined,
      options: raw.options && typeof raw.options === "object" ? raw.options : undefined,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : index,
      // 列表排序：没填就用老字段 sort，再没有就用数组下标
      listSort,
      // 搜索排序：没填就按下标
      searchSort: Number.isFinite(Number(raw.searchSort)) ? Number(raw.searchSort) : index,
      // 表单排序：没填默认和列表排序一致（符合需求 002 第 5 条）
      formSort: Number.isFinite(Number(raw.formSort)) ? Number(raw.formSort) : listSort,
      formVisible: raw.formVisible === undefined ? true : Boolean(raw.formVisible),
      formSpan: normalizeFormSpan(raw.formSpan),
      rules: normalizeFieldRules(raw.rules, name),
    });
  });

  return fields.sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

/**
 * 规范化自定义操作按钮。
 *
 * 要求：
 *   - label 和 value 都必须有（value 是前端插槽匹配用的标识）
 *   - value 只允许字母、数字、下划线、短横线，避免出现奇怪字符导致插槽名匹配不上
 */
export function normalizeCustomActions(input: unknown): CustomAction[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((raw: any) => {
      if (!raw || typeof raw !== "object") return null;
      const label = String(raw.label || "").trim();
      const value = String(raw.value || "").trim();
      if (!label || !value) return null;
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
        throw new Error(`自定义按钮标识「${value}」不合法：只能包含字母、数字、下划线、短横线`);
      }
      return {
        label,
        value,
        permission: raw.permission ? String(raw.permission) : undefined,
        type: ["primary", "success", "warning", "danger", "default"].includes(raw.type) ? raw.type : "primary",
        confirm: Boolean(raw.confirm),
      } as CustomAction;
    })
    .filter(Boolean) as CustomAction[];
}

/**
 * 默认操作列配置：新增/修改/删除全开，权限码用全局 data:*。
 * （新建表格配置时用的是下面按 TCID 生成的版本，这个留着给老数据和测试用）
 */
export function defaultOperations(): TableOperations {
  return {
    create: true,
    update: true,
    delete: true,
    createPermission: "data:create",
    updatePermission: "data:update",
    deletePermission: "data:delete",
  };
}

/**
 * 按 TCID 生成默认的按钮权限码（新建表格配置时用）。
 *
 * 为什么按 TCID 隔离：
 *   以前默认是全局 data:create，「A 表的新增」和「B 表的新增」是同一个码，
 *   角色里一勾等于所有表都能新增。按 TCID 生成 data:create:TORDER 之后，
 *   权限树里勾哪张表就只放哪张表，语义清晰。
 *
 * 注意：老配置里已写死的 data:create 仍然有效（不做数据迁移，避免动历史角色）。
 */
export function defaultOperationsForTcid(tcid: string): TableOperations {
  return {
    create: true,
    update: true,
    delete: true,
    createPermission: `data:create:${tcid}`,
    updatePermission: `data:update:${tcid}`,
    deletePermission: `data:delete:${tcid}`,
  };
}

/** 规范化操作列配置 */
export function normalizeOperations(input: unknown): TableOperations {
  const base = defaultOperations();
  if (!input || typeof input !== "object") return base;
  const raw = input as any;
  return {
    create: raw.create === undefined ? base.create : Boolean(raw.create),
    update: raw.update === undefined ? base.update : Boolean(raw.update),
    delete: raw.delete === undefined ? base.delete : Boolean(raw.delete),
    createPermission: raw.createPermission ? String(raw.createPermission) : base.createPermission,
    updatePermission: raw.updatePermission ? String(raw.updatePermission) : base.updatePermission,
    deletePermission: raw.deletePermission ? String(raw.deletePermission) : base.deletePermission,
  };
}

/**
 * 界面配置（存进 sys_table_config.config 的那段 JSON）。
 *
 * 干什么：
 *   超管在「表格配置」页面里写一段 JSON，描述这张表长什么样。
 *   目前只开放两个位置：表格的高度、新增/编辑弹框的长宽。
 *   以后要加新的外观项，加进这个接口 + 下面的 asPixel 调用即可，
 *   前端同名默认值在 client/src/components/table/types.ts 里补一行。
 */
export interface TableUiConfig {
  /** 表格区域 */
  table?: {
    /** 表格固定高度（像素）。表格表头会吸顶、内容区自己滚动 */
    height?: number;
  };
  /** 表单区域 */
  form?: {
    /** 新增/编辑弹框 */
    dialog?: {
      /** 弹框宽度（像素） */
      width?: number;
      /** 弹框高度（像素）。前端会再和窗口高度取小，避免小屏上超出屏幕 */
      height?: number;
    };
  };
}

/**
 * 把用户写的界面配置 JSON 校一遍。
 *
 * 干什么：
 *   只放行我们认识的字段（table.height / form.dialog.width / form.dialog.height），
 *   名字写错（比如把 height 拼成 heigth）会当场报错，而不是默默不生效。
 *
 * 参数：
 *   input - 对象，或者 JSON 字符串（后台表单是文本域，可能直接把原文传过来）
 *
 * 返回：
 *   只包含「用户真正写了」的字段的对象；缺的字段交给前端默认值兜底。
 *   传空值（null / undefined / 空字符串）时返回 null，表示「没配过」。
 *
 * 注意：
 *   - 抛的是普通 Error，由 TableConfigService.normalizeOrThrow 翻译成 HTTP 400
 *   - 数值单位都是像素，超出范围直接拒绝，防止有人填 99999 把页面撑爆
 *   - 整体 JSON 上限 20KB（和路由的 config 保持一致）
 */
export function normalizeTableUiConfig(input: unknown): TableUiConfig | null {
  const raw = parseUiConfigJson(input);
  if (raw === null) return null;

  const result: TableUiConfig = {};

  // 顶层只认 table / form 两个键，多写的一律报错
  assertNoUnknownKeys(raw, ["table", "form"], "顶层");

  // ---- 表格高度 ----
  if (raw.table !== undefined) {
    const table = asPlainObject(raw.table, "table");
    assertNoUnknownKeys(table, ["height"], "table");
    if (table.height !== undefined) {
      result.table = { height: asPixel(table.height, "table.height", 100, 5000) };
    }
  }

  // ---- 表单弹框的长宽 ----
  if (raw.form !== undefined) {
    const form = asPlainObject(raw.form, "form");
    assertNoUnknownKeys(form, ["dialog"], "form");
    if (form.dialog !== undefined) {
      const dialog = asPlainObject(form.dialog, "form.dialog");
      assertNoUnknownKeys(dialog, ["width", "height"], "form.dialog");
      const size: { width?: number; height?: number } = {};
      if (dialog.width !== undefined) size.width = asPixel(dialog.width, "form.dialog.width", 300, 5000);
      if (dialog.height !== undefined) size.height = asPixel(dialog.height, "form.dialog.height", 200, 5000);
      // 只写了 width 或只写了 height 都行，另一个用前端默认值
      if (Object.keys(size).length > 0) result.form = { dialog: size };
    }
  }

  return result;
}

/**
 * 把外面传进来的界面配置解析成对象。
 *
 * 返回值：
 *   没配过（null / undefined / 空字符串 / 空对象）→ null
 *   字符串 → JSON.parse 出来的对象
 *   对象 → 原样返回
 */
function parseUiConfigJson(input: unknown): any | null {
  if (input === undefined || input === null || input === "") return null;

  let raw: any = input;
  // 文本域传上来的是一整段文字，先当 JSON 解析；解析不了说明用户括号逗号写错了
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error("界面配置不是合法的 JSON，请检查引号和逗号");
    }
  }

  if (Array.isArray(raw)) throw new Error("界面配置必须是一个 JSON 对象，不能是数组");
  if (typeof raw !== "object") throw new Error("界面配置必须是一个 JSON 对象");

  // 和路由 config 一样限 20KB：防止有人往里塞图片 base64 之类的东西
  if (JSON.stringify(raw).length > 20000) throw new Error("界面配置太大了（上限 20KB）");

  // 空对象 {} 等价于「没配过」
  if (Object.keys(raw).length === 0) return null;
  return raw;
}

/** 确认拿到的是一层普通对象（不是 null、数组、字符串） */
function asPlainObject(value: unknown, path: string): any {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`界面配置的 ${path} 必须是一个对象`);
  }
  return value;
}

/**
 * 确认对象里没有我们不认识的字段。
 *
 * 为什么要这么严：JSON 是手写的，把 height 拼成 heigth 时如果不报错，
 * 就会「配了但没生效」，排查起来很费劲；这里直接指出是哪个字段不认识。
 */
function assertNoUnknownKeys(value: any, allowed: string[], where: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`界面配置的 ${where} 里不认识这些字段：${unknown.join("、")}（目前只支持 ${allowed.join("、")}）`);
  }
}

/** 校验一个像素值：必须是数字，且落在 [min, max] 之间 */
function asPixel(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`界面配置的 ${path} 必须是数字（单位像素）`);
  }
  if (value < min || value > max) {
    throw new Error(`界面配置的 ${path} 必须在 ${min} ~ ${max} 之间（单位像素）`);
  }
  return Math.round(value);
}
