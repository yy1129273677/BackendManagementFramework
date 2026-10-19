/**
 * 公用表格组件的类型定义。
 *
 * 这些类型对应后端 GET /api/table/:tcid/config 返回的结构，
 * 改后端返回字段时记得同步这里，否则前端会静默拿不到值。
 */

/** 字段类型 */
export type FieldType = "string" | "text" | "number" | "integer" | "boolean" | "date" | "datetime" | "json";

/** 搜索方式 */
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

/** 表单校验规则 */
export interface FormFieldRules {
  /** 正则表达式（字符串形式） */
  pattern?: string;
  /** 校验失败的提示文案 */
  message?: string;
  /** 自定义校验器名字（在 validators.ts 里注册） */
  validator?: string;
}

/** 字段定义（表格列 / 表单项 / 搜索项都从它来） */
export interface TableField {
  name: string;
  label: string;
  type: FieldType;
  visible?: boolean;
  searchable?: boolean;
  searchOp?: SearchOp;
  editable?: boolean;
  required?: boolean;
  width?: number;
  /** 自定义单元格插槽名，默认 col-<字段名> */
  slot?: string;
  options?: {
    dict?: string;
    static?: Array<{ label: string; value: string }>;
  };
  sort?: number;
  /** 列表显示排序（小的在前） */
  listSort?: number;
  /** 搜索栏排序 */
  searchSort?: number;
  /** 表单排序（默认与 listSort 相同） */
  formSort?: number;
  /** 是否在表单里显示 */
  formVisible?: boolean;
  /** 表单占宽（24 栅格制） */
  formSpan?: number;
  /** 校验规则 */
  rules?: FormFieldRules;
}

/** 表格行数据：物理表的列 + 固定列 */
export interface TableRow {
  id: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

/** 自定义操作按钮 */
export interface CustomAction {
  label: string;
  /** 按钮标识，前端用 #action-<value> 插槽接管点击逻辑 */
  value: string;
  permission?: string;
  type?: "primary" | "success" | "warning" | "danger" | "default";
  confirm?: boolean;
}

/** 操作列权限（后端已经算好了当前用户能不能做） */
export interface TableOperations {
  create: boolean;
  update: boolean;
  delete: boolean;
  createPermission?: string;
  updatePermission?: string;
  deletePermission?: string;
}

/**
 * 界面配置：描述这张表「长什么样」的那部分（表格高度、表单弹框长宽）。
 *
 * 存在后端 sys_table_config.config 里，超管在「表格配置 → 界面配置（JSON）」里手填。
 * 所有字段都可以不写，不写的部分由下面的 DEFAULT_TABLE_UI_CONFIG 兜底。
 */
export interface TableUiConfig {
  /** 表格区域 */
  table?: {
    /** 表格固定高度（像素）。配了以后表头吸顶、内容区自己滚动 */
    height?: number;
  };
  /** 表单区域 */
  form?: {
    /** 新增 / 编辑弹框 */
    dialog?: {
      /** 弹框宽度（像素） */
      width?: number;
      /** 弹框高度（像素）。实际显示时会再和窗口高度比一次，小屏上不会超出屏幕 */
      height?: number;
    };
  };
}

/**
 * 界面配置的内置默认值。
 *
 * 后端 config 允许为空（表示「没配过」），这时候就用这里的值，
 * 所以以后往 JSON 里加新配置项也不用给历史数据做迁移。
 * 该默认值需与后端 normalizeTableUiConfig 注释里的约定保持一致。
 */
export const DEFAULT_TABLE_UI_CONFIG = {
  table: { height: 700 },
  form: { dialog: { width: 1200, height: 960 } },
};

/** 合并后的界面配置：每一项都一定有值，组件里直接用不用再判空 */
export interface ResolvedTableUiConfig {
  table: { height: number };
  form: { dialog: { width: number; height: number } };
}

/**
 * 把后端返回的界面配置和内置默认值合并。
 *
 * 参数：
 *   config - 后端返回的 config；可能是 null（没配过）或只配了一部分
 *
 * 返回：
 *   每项都有值的配置对象，组件直接读即可
 */
export function resolveTableUiConfig(config?: TableUiConfig | null): ResolvedTableUiConfig {
  return {
    table: {
      // ?? 的意思是：只有左边是 null / undefined 时才用右边的默认值（0 不会被误当成空）
      height: config?.table?.height ?? DEFAULT_TABLE_UI_CONFIG.table.height,
    },
    form: {
      dialog: {
        width: config?.form?.dialog?.width ?? DEFAULT_TABLE_UI_CONFIG.form.dialog.width,
        height: config?.form?.dialog?.height ?? DEFAULT_TABLE_UI_CONFIG.form.dialog.height,
      },
    },
  };
}

/** 后端返回的渲染配置 */
export interface TableConfig {
  tcid: string;
  name: string;
  remark?: string;
  physicalTable?: string;
  pageSize: number;
  searchMode: "AND" | "OR" | "CUSTOM";
  conditions?: any;
  /** 全部字段（含隐藏列，编辑表单要用） */
  fields: TableField[];
  /** 表格要显示的列 */
  columns: TableField[];
  /** 搜索栏要显示的字段 */
  searchFields: TableField[];
  operations: TableOperations;
  /** 当前用户能看到的自定义按钮 */
  customActions: CustomAction[];
  /** 界面配置（表格高度、表单弹框长宽）；没配过时为 null */
  config?: TableUiConfig | null;
}

/** 分页查询参数 */
export interface QueryParams {
  page: number;
  pageSize: number;
  /** JSON 字符串，交给后端解析成搜索条件 */
  filters?: string;
}
