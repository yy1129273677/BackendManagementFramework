/**
 * 表格配置相关的请求体。
 */

export class CreateTableConfigDto {
  /** 表格名称，比如「订单列表」 */
  name: string;
  remark?: string;
  /** 字段定义数组，至少一个 */
  fields: any[];
  /** 默认搜索逻辑：AND / OR / CUSTOM */
  searchMode?: string;
  /** CUSTOM 模式的默认条件组（结构化，不是原始 SQL） */
  conditions?: any;
  /** 操作列配置 */
  operations?: any;
  /** 自定义按钮 [{ label, value, permission }] */
  customActions?: any[];
  /** 每页条数 */
  pageSize?: number;
  /**
   * 界面配置（表格高度、表单弹框长宽）。
   * 可以是对象，也可以是文本域传上来的 JSON 字符串；
   * 具体校验在 table-field.types.ts 的 normalizeTableUiConfig 里做。
   */
  config?: any;
}

export class UpdateTableConfigDto {
  name?: string;
  remark?: string;
  fields?: any[];
  searchMode?: string;
  conditions?: any;
  operations?: any;
  customActions?: any[];
  pageSize?: number;
  /** 界面配置；不传表示「不改」，传 null / 空字符串表示「清空，回到内置默认」 */
  config?: any;
}
