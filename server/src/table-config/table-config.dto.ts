/**
 * 表格配置相关的请求体。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTableConfigDto {
  /** 表格名称，比如「订单列表」 */
  @ApiProperty({ description: "表格名称", example: "订单列表" })
  name: string;
  @ApiPropertyOptional({ description: "备注", example: "演示用的订单表" })
  remark?: string;
  /** 字段定义数组，至少一个 */
  @ApiProperty({
    description:
      "字段定义数组，至少 1 个、最多 60 个。每个字段支持：name（小写字母开头的列名）、label、type（string/text/number/integer/boolean/date/datetime/json）、visible、searchable、searchOp、editable、required、width、slot、options、sort、listSort、searchSort、formSort、formVisible、formSpan（1~24）、rules（pattern/message/validator）",
    type: [Object],
    example: [{ name: "order_no", label: "订单号", type: "string", searchable: true, required: true, formSpan: 12 }],
  })
  fields: any[];
  /** 默认搜索逻辑：AND / OR / CUSTOM */
  @ApiPropertyOptional({
    description: "默认搜索逻辑：AND / OR / CUSTOM（CUSTOM 时使用结构化条件组 conditions）",
    enum: ["AND", "OR", "CUSTOM"],
    example: "AND",
  })
  searchMode?: string;
  /** CUSTOM 模式的默认条件组（结构化，不是原始 SQL） */
  @ApiPropertyOptional({
    description:
      "CUSTOM 模式的默认条件组（结构化条件，不是原始 SQL WHERE）：{ logic: AND|OR, not, conditions: [{ field, op, value }], groups: [...] }",
    type: Object,
    example: { logic: "AND", conditions: [{ field: "status", op: "eq", value: "paid" }] },
  })
  conditions?: any;
  /** 操作列配置 */
  @ApiPropertyOptional({
    description:
      "操作列配置：{ create, update, delete（是否开启）, createPermission, updatePermission, deletePermission（所需权限码） }；不传则默认全开并按 TCID 生成权限码",
    type: Object,
    example: {
      create: true,
      update: true,
      delete: true,
      createPermission: "data:create:TDEMOORDERS",
      updatePermission: "data:update:TDEMOORDERS",
      deletePermission: "data:delete:TDEMOORDERS",
    },
  })
  operations?: any;
  /** 自定义按钮 [{ label, value, permission }] */
  @ApiPropertyOptional({
    description:
      "自定义按钮数组，每项结构：{ label, value（字母/数字/下划线/短横线，1~32 位）, permission?, type?, confirm? }",
    type: [Object],
    example: [
      { label: "发货", value: "ship", permission: "data:action:TDEMOORDERS:ship", type: "primary", confirm: true },
    ],
  })
  customActions?: any[];
  /** 每页条数 */
  @ApiPropertyOptional({ description: "每页条数，取值范围 1~200，不填默认 20", minimum: 1, maximum: 200, example: 20 })
  pageSize?: number;
  /**
   * 界面配置（表格高度、表单弹框长宽）。
   * 可以是对象，也可以是文本域传上来的 JSON 字符串；
   * 具体校验在 table-field.types.ts 的 normalizeTableUiConfig 里做。
   */
  @ApiPropertyOptional({
    description:
      "界面配置（对象或 JSON 字符串，上限 20KB）：只允许 table.height（100~5000px）与 form.dialog.width（300~5000px）、form.dialog.height（200~5000px）；不认识的键会报错",
    type: Object,
    example: { table: { height: 520 }, form: { dialog: { width: 720, height: 560 } } },
  })
  config?: any;
}

export class UpdateTableConfigDto {
  @ApiPropertyOptional({ description: "表格名称", example: "订单列表" })
  name?: string;
  @ApiPropertyOptional({ description: "备注", example: "演示用的订单表" })
  remark?: string;
  @ApiPropertyOptional({
    description:
      "字段定义数组（整体覆盖）。可以新增字段，后端会自动 ADD COLUMN；从配置移除的字段物理列保留、数据不删除；不允许修改已有字段的类型",
    type: [Object],
    example: [{ name: "order_no", label: "订单号", type: "string", searchable: true, required: true, formSpan: 12 }],
  })
  fields?: any[];
  @ApiPropertyOptional({
    description: "默认搜索逻辑：AND / OR / CUSTOM",
    enum: ["AND", "OR", "CUSTOM"],
    example: "AND",
  })
  searchMode?: string;
  @ApiPropertyOptional({
    description:
      "CUSTOM 模式的默认条件组（结构化条件，不是原始 SQL WHERE）：{ logic: AND|OR, not, conditions: [{ field, op, value }], groups: [...] }",
    type: Object,
    example: { logic: "AND", conditions: [{ field: "status", op: "eq", value: "paid" }] },
  })
  conditions?: any;
  @ApiPropertyOptional({
    description:
      "操作列配置：{ create, update, delete（是否开启）, createPermission, updatePermission, deletePermission（所需权限码） }",
    type: Object,
    example: {
      create: true,
      update: true,
      delete: true,
      createPermission: "data:create:TDEMOORDERS",
      updatePermission: "data:update:TDEMOORDERS",
      deletePermission: "data:delete:TDEMOORDERS",
    },
  })
  operations?: any;
  @ApiPropertyOptional({
    description:
      "自定义按钮数组，每项结构：{ label, value（字母/数字/下划线/短横线，1~32 位）, permission?, type?, confirm? }",
    type: [Object],
    example: [
      { label: "发货", value: "ship", permission: "data:action:TDEMOORDERS:ship", type: "primary", confirm: true },
    ],
  })
  customActions?: any[];
  @ApiPropertyOptional({ description: "每页条数，取值范围 1~200", minimum: 1, maximum: 200, example: 20 })
  pageSize?: number;
  /** 界面配置；不传表示「不改」，传 null / 空字符串表示「清空，回到内置默认」 */
  @ApiPropertyOptional({
    description:
      "界面配置（对象或 JSON 字符串）：不传表示不改；传 null / 空字符串表示清空并回到内置默认。只允许 table.height 与 form.dialog.width/height",
    type: Object,
    example: { table: { height: 520 }, form: { dialog: { width: 720, height: 560 } } },
  })
  config?: any;
}
