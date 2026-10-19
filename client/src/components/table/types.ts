/**
 * 公用表格组件的类型定义。
 *
 * 这些类型对应后端 GET /api/table/:tcid/config 返回的结构，
 * 改后端返回字段时记得同步这里，否则前端会静默拿不到值。
 */

/** 字段类型 */
export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'json'

/** 搜索方式 */
export type SearchOp =
    | 'eq' | 'ne' | 'like' | 'notLike'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'in' | 'notIn' | 'between'
    | 'isNull' | 'notNull'

/** 字段定义（表格列 / 表单项 / 搜索项都从它来） */
export interface TableField {
    name: string
    label: string
    type: FieldType
    visible?: boolean
    searchable?: boolean
    searchOp?: SearchOp
    editable?: boolean
    required?: boolean
    width?: number
    /** 自定义单元格插槽名，默认 col-<字段名> */
    slot?: string
    options?: {
        dict?: string
        static?: Array<{ label: string; value: string }>
    }
    sort?: number
}

/** 表格行数据：物理表的列 + 固定列 */
export interface TableRow {
    id: string
    created_at?: string
    updated_at?: string
    [key: string]: any
}

/** 自定义操作按钮 */
export interface CustomAction {
    label: string
    /** 按钮标识，前端用 #action-<value> 插槽接管点击逻辑 */
    value: string
    permission?: string
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
    confirm?: boolean
}

/** 操作列权限（后端已经算好了当前用户能不能做） */
export interface TableOperations {
    create: boolean
    update: boolean
    delete: boolean
    createPermission?: string
    updatePermission?: string
    deletePermission?: string
}

/** 后端返回的渲染配置 */
export interface TableConfig {
    tcid: string
    name: string
    remark?: string
    physicalTable?: string
    pageSize: number
    searchMode: 'AND' | 'OR' | 'CUSTOM'
    conditions?: any
    /** 全部字段（含隐藏列，编辑表单要用） */
    fields: TableField[]
    /** 表格要显示的列 */
    columns: TableField[]
    /** 搜索栏要显示的字段 */
    searchFields: TableField[]
    operations: TableOperations
    /** 当前用户能看到的自定义按钮 */
    customActions: CustomAction[]
}

/** 分页查询参数 */
export interface QueryParams {
    page: number
    pageSize: number
    /** JSON 字符串，交给后端解析成搜索条件 */
    filters?: string
}
