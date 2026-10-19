import type {FieldType, QueryParams, TableField} from './types'

/**
 * 公用表格组件的纯函数工具集。
 *
 * 为什么单独抽出来：
 *   这些逻辑（插槽名怎么拼、哪些列要显示、搜索值怎么序列化成 filters）
 *   是「配置驱动渲染」的核心规则，抽成纯函数才能写单元测试，
 *   也方便你在自定义页面里复用。
 */

/**
 * 由自定义按钮的 value 得到插槽名。
 *
 * 规则：action-<value>
 * 例：配置里的按钮 { label: '标记发货', value: 'ship' }，
 *    自定义页面写 <template #action-ship="{ row }"> 就能接管这个按钮。
 */
export function resolveActionSlotName(value: string): string {
    return `action-${String(value || '').trim()}`
}

/**
 * 由字段名得到自定义单元格的插槽名。
 *
 * 规则：col-<字段名>
 * 后端返回字段时会带一个 slot 字段（默认也是这个规则），
 * 所以推荐优先用 field.slot，这里给「没拿到配置时」兜底。
 */
export function resolveColumnSlotName(fieldName: string): string {
    return `col-${String(fieldName || '').trim()}`
}

/** 这一列是否要显示（visible 不写默认显示） */
export function isColumnVisible(field: TableField): boolean {
    return field.visible !== false
}

/** 过滤出要显示的列，并按 sort 排序 */
export function pickVisibleColumns(fields: TableField[]): TableField[] {
    return (fields || []).filter(isColumnVisible).sort((a, b) => (a.sort || 0) - (b.sort || 0))
}

/** 过滤出搜索项（只有 searchable === true 的字段） */
export function pickSearchFields(fields: TableField[]): TableField[] {
    return (fields || []).filter((field) => field.searchable === true)
}

/**
 * 把单元格的值格式化成给人看的文字。
 *
 * 注意：
 *   日期后端返回的是 ISO 字符串（2024-01-01T00:00:00.000Z），
 *   表格里只显示日期部分，避免一行字太长。
 */
export function formatCellValue(value: any, type: FieldType): string {
    if (value === null || value === undefined || value === '') return ''
    if (type === 'boolean') return value === true || value === 'true' || value === 1 || value === '1' ? '是' : '否'
    if (type === 'date') return String(value).slice(0, 10)
    if (type === 'datetime') return String(value).replace('T', ' ').slice(0, 19)
    if (type === 'number') {
        const numberValue = Number(value)
        return Number.isFinite(numberValue) ? String(numberValue) : String(value)
    }
    return String(value)
}

/** 搜索项的初始值：区间搜索用数组，其它用空字符串 */
export function defaultSearchValues(fields: TableField[]): Record<string, any> {
    const values: Record<string, any> = {}
    for (const field of fields || []) {
        values[field.name] = field.searchOp === 'between' ? [] : ''
    }
    return values
}

/** 判断一个搜索值是不是空的（空数组、空字符串、null 都算空） */
function isEmptyValue(value: any): boolean {
    if (value === null || value === undefined || value === '') return true
    if (Array.isArray(value)) return value.length === 0 || value.every((item) => item === '' || item === null || item === undefined)
    return false
}

/**
 * 把搜索表单的值转成后端要的 filters 对象。
 *
 * 参数：
 *   values - 搜索表单的值，key 是字段名
 *   fields - 可搜索的字段定义
 *   mode   - 表格配置的搜索模式 AND / OR / CUSTOM
 *
 * 返回：
 *   { mode, conditions: [...] }；用 CUSTOM 模式时额外套一层 group
 *
 * 注意：
 *   空的搜索项会被跳过，不会生成 `status = ''` 这种把结果查空的无效条件。
 */
export function buildFiltersPayload(
    values: Record<string, any>,
    fields: TableField[],
    mode: string = 'AND',
): { mode: string; conditions: Array<{ field: string; op: string; value: any }> } {
    const conditions: Array<{ field: string; op: string; value: any }> = []

    for (const field of fields || []) {
        const raw = values?.[field.name]
        if (isEmptyValue(raw)) continue

        const op = field.searchOp || 'eq'
        let value: any = raw

        if (op === 'between') {
            value = Array.isArray(raw) ? raw : [raw, raw]
        } else if (op === 'in' || op === 'notIn') {
            value = Array.isArray(raw) ? raw : String(raw).split(',').map((item) => item.trim()).filter(Boolean)
        }

        conditions.push({field: field.name, op, value})
    }

    const upperMode = String(mode || 'AND').toUpperCase()
    return {mode: upperMode, conditions}
}

/**
 * 组装查询参数，给 <Table> 组件调接口用。
 *
 * filters 是 JSON 字符串：后端 GET 接口用 query 参数接收，
 * 直接塞对象会被序列化成 [object Object]。
 */
export function buildQueryParams(options: {
    page: number
    pageSize: number
    searchValues: Record<string, any>
    fields: TableField[]
    mode?: string
}): QueryParams {
    const payload = buildFiltersPayload(options.searchValues, options.fields, options.mode)
    const params: QueryParams = {
        page: Math.max(1, Number(options.page) || 1),
        pageSize: Math.max(1, Number(options.pageSize) || 20),
    }
    // 没有任何条件就不传 filters，URL 更干净，后端也走「不加 WHERE」的快路径
    if (payload.conditions.length > 0) {
        params.filters = JSON.stringify(payload)
    }
    return params
}

/** 每页条数限制在 1~200，和後端保持一致 */
export function clampPageSize(value: any, fallback = 20): number {
    const size = Number(value) || fallback
    return Math.min(200, Math.max(1, size))
}

/** 新建一行时的初始表单值 */
export function buildEmptyForm(fields: TableField[]): Record<string, any> {
    const model: Record<string, any> = {}
    for (const field of fields || []) {
        if (field.type === 'boolean') model[field.name] = false
        else if (field.type === 'number' || field.type === 'integer') model[field.name] = undefined
        else model[field.name] = ''
    }
    return model
}
