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
}
