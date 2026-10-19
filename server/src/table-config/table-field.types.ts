import {isValidIdentifier} from '../common/identifiers'

/**
 * 表格字段的类型定义与校验。
 *
 * 这是「配置即建表」的核心数据结构：
 *   超管在页面上加一行字段，这里把它规范成数据库列 + 前端渲染规则。
 */

/** 支持的字段类型（每种对应一个 PostgreSQL 类型 + 一个前端控件） */
export type FieldType = 'string' | 'text' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'json'

/** 支持的搜索方式 */
export type SearchOp =
    | 'eq'
    | 'ne'
    | 'like'
    | 'notLike'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'notIn'
    | 'between'
    | 'isNull'
    | 'notNull'

/** 字段定义（存进 sys_table_config.fields 的 JSON） */
export interface TableField {
    /** 数据库列名，同时是接口字段名：小写字母开头，只含小写字母/数字/下划线 */
    name: string
    /** 中文标签，表格表头和表单里显示 */
    label: string
    /** 字段类型 */
    type: FieldType
    /** 是否在表格里显示这一列 */
    visible?: boolean
    /** 是否作为搜索条件 */
    searchable?: boolean
    /** 该字段默认的搜索方式 */
    searchOp?: SearchOp
    /** 是否允许在新增/编辑表单里修改 */
    editable?: boolean
    /** 是否必填（在接口层校验，数据库列允许为空，便于加字段） */
    required?: boolean
    /** 列宽（px），不填自动 */
    width?: number
    /** 自定义单元格插槽名：前端用 #col-<name> 或配置里指定的名字接管渲染 */
    slot?: string
    /** 选项来源：字典编码或静态选项，用于下拉框 */
    options?: {
        /** 引用 sys_dict_type 里的字典编码 */
        dict?: string
        /** 写死的选项 */
        static?: Array<{ label: string; value: string }>
    }
    /** 排序，小的在前 */
    sort?: number
}

/** 自定义操作按钮（渲染在每行操作列里） */
export interface CustomAction {
    /** 按钮文字 */
    label: string
    /** 按钮标识，前端用 #action-<value> 插槽接管点击逻辑 */
    value: string
    /** 需要什么权限才能看到/点击 */
    permission?: string
    /** 按钮样式 */
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'default'
    /** 点击前是否弹确认框 */
    confirm?: boolean
}

/** 操作列的权限与开关 */
export interface TableOperations {
    create?: boolean
    update?: boolean
    delete?: boolean
    /** 三个操作各自需要的权限码，默认 data:create / data:update / data:delete */
    createPermission?: string
    updatePermission?: string
    deletePermission?: string
}

/** 字段类型 → PostgreSQL 列类型 */
const SQL_TYPE_MAP: Record<FieldType, string> = {
    string: 'text',
    text: 'text',
    number: 'numeric(18,2)',
    integer: 'integer',
    boolean: 'boolean',
    date: 'date',
    datetime: 'timestamptz',
    json: 'jsonb',
}

/** 所有合法类型，用于校验 */
const ALL_FIELD_TYPES = Object.keys(SQL_TYPE_MAP) as FieldType[]

/** 所有合法搜索方式 */
export const ALL_SEARCH_OPS: SearchOp[] = [
    'eq', 'ne', 'like', 'notLike', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'between', 'isNull', 'notNull',
]

/** 每种字段类型默认的搜索方式（前端新建字段时预填） */
export function defaultSearchOp(type: FieldType): SearchOp {
    if (type === 'string' || type === 'text') return 'like'
    if (type === 'number' || type === 'integer' || type === 'date' || type === 'datetime') return 'between'
    return 'eq'
}

/** 字段类型对应的数据库列类型 */
export function sqlTypeFor(type: FieldType): string {
    return SQL_TYPE_MAP[type] || 'text'
}

/** 判断字符串是不是支持的字段类型 */
export function isFieldType(value: string): value is FieldType {
    return ALL_FIELD_TYPES.includes(value as FieldType)
}

/** 判断字符串是不是支持的搜索方式 */
export function isSearchOp(value: string): value is SearchOp {
    return ALL_SEARCH_OPS.includes(value as SearchOp)
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
        throw new Error('表格至少需要一个字段')
    }
    if (input.length > 60) {
        throw new Error('单张表格最多 60 个字段，字段太多建议拆表')
    }

    const seen = new Set<string>()
    const fields: TableField[] = []

    input.forEach((raw: any, index: number) => {
        if (!raw || typeof raw !== 'object') {
            throw new Error(`第 ${index + 1} 个字段格式不对`)
        }
        const name = String(raw.name || '').trim()
        if (!isValidIdentifier(name)) {
            throw new Error(
                `字段名「${name}」不合法：只能小写字母开头，包含小写字母、数字、下划线，且不能是数据库关键字`,
            )
        }
        if (seen.has(name)) {
            throw new Error(`字段名「${name}」重复了`)
        }
        seen.add(name)

        const type = String(raw.type || 'string') as FieldType
        if (!isFieldType(type)) {
            throw new Error(`字段「${name}」的类型「${raw.type}」不支持`)
        }

        const searchOp = raw.searchOp && isSearchOp(String(raw.searchOp)) ? (raw.searchOp as SearchOp) : defaultSearchOp(type)
        const label = String(raw.label || name).trim() || name

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
            options: raw.options && typeof raw.options === 'object' ? raw.options : undefined,
            sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : index,
        })
    })

    return fields.sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

/**
 * 规范化自定义操作按钮。
 *
 * 要求：
 *   - label 和 value 都必须有（value 是前端插槽匹配用的标识）
 *   - value 只允许字母、数字、下划线、短横线，避免出现奇怪字符导致插槽名匹配不上
 */
export function normalizeCustomActions(input: unknown): CustomAction[] {
    if (!Array.isArray(input)) return []

    return input
        .map((raw: any) => {
            if (!raw || typeof raw !== 'object') return null
            const label = String(raw.label || '').trim()
            const value = String(raw.value || '').trim()
            if (!label || !value) return null
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(value)) {
                throw new Error(`自定义按钮标识「${value}」不合法：只能包含字母、数字、下划线、短横线`)
            }
            return {
                label,
                value,
                permission: raw.permission ? String(raw.permission) : undefined,
                type: ['primary', 'success', 'warning', 'danger', 'default'].includes(raw.type) ? raw.type : 'primary',
                confirm: Boolean(raw.confirm),
            } as CustomAction
        })
        .filter(Boolean) as CustomAction[]
}

/**
 * 默认操作列配置：新增/修改/删除全开，权限码用 data:*。
 */
export function defaultOperations(): TableOperations {
    return {
        create: true,
        update: true,
        delete: true,
        createPermission: 'data:create',
        updatePermission: 'data:update',
        deletePermission: 'data:delete',
    }
}

/** 规范化操作列配置 */
export function normalizeOperations(input: unknown): TableOperations {
    const base = defaultOperations()
    if (!input || typeof input !== 'object') return base
    const raw = input as any
    return {
        create: raw.create === undefined ? base.create : Boolean(raw.create),
        update: raw.update === undefined ? base.update : Boolean(raw.update),
        delete: raw.delete === undefined ? base.delete : Boolean(raw.delete),
        createPermission: raw.createPermission ? String(raw.createPermission) : base.createPermission,
        updatePermission: raw.updatePermission ? String(raw.updatePermission) : base.updatePermission,
        deletePermission: raw.deletePermission ? String(raw.deletePermission) : base.deletePermission,
    }
}
