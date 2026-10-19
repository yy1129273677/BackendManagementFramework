import {describe, expect, it} from 'vitest'
import {
    buildEmptyForm,
    buildFiltersPayload,
    buildQueryParams,
    clampPageSize,
    defaultSearchValues,
    formatCellValue,
    isColumnVisible,
    pickSearchFields,
    pickVisibleColumns,
    resolveActionSlotName,
    resolveColumnSlotName,
} from './utils'
import type {TableField} from './types'

/**
 * 公用表格组件工具函数的单元测试。
 *
 * 为什么测这些：
 *   「插槽名怎么拼」「搜索值怎么序列化」是前后端契约的一部分，
 *   一旦改了而自定义页面没跟着改，按钮就会静默失效（点了没反应，也不报错）。
 *   用测试把规则钉死，改的时候能立刻发现。
 */
const fields: TableField[] = [
    {name: 'order_no', label: '订单号', type: 'string', visible: true, searchable: true, searchOp: 'like', sort: 1},
    {name: 'amount', label: '金额', type: 'number', visible: true, searchable: true, searchOp: 'between', sort: 2},
    {name: 'status', label: '状态', type: 'string', visible: true, searchable: true, searchOp: 'eq', sort: 3},
    {name: 'remark', label: '备注', type: 'text', visible: false, searchable: false, sort: 4},
]

describe('插槽名规则', () => {
    it('自定义按钮的插槽名是 action-<value>', () => {
        expect(resolveActionSlotName('ship')).toBe('action-ship')
        expect(resolveActionSlotName('detail')).toBe('action-detail')
    })

    it('单元格插槽名是 col-<字段名>', () => {
        expect(resolveColumnSlotName('status')).toBe('col-status')
    })
})

describe('列与搜索项的筛选', () => {
    it('visible !== false 的列才显示，并按 sort 排序', () => {
        expect(pickVisibleColumns(fields).map((field) => field.name)).toEqual(['order_no', 'amount', 'status'])
    })

    it('只有 searchable === true 的字段进搜索栏', () => {
        expect(pickSearchFields(fields).map((field) => field.name)).toEqual(['order_no', 'amount', 'status'])
        expect(pickSearchFields([{name: 'a', label: 'a', type: 'string'}])).toEqual([])
    })

    it('isColumnVisible 默认显示', () => {
        expect(isColumnVisible({name: 'a', label: 'a', type: 'string'})).toBe(true)
        expect(isColumnVisible({name: 'a', label: 'a', type: 'string', visible: false})).toBe(false)
    })
})

describe('单元格格式化', () => {
    it('布尔值显示成是/否', () => {
        expect(formatCellValue(true, 'boolean')).toBe('是')
        expect(formatCellValue(false, 'boolean')).toBe('否')
        expect(formatCellValue('true', 'boolean')).toBe('是')
    })

    it('日期只显示日期部分，时间戳替换 T', () => {
        expect(formatCellValue('2024-05-01T10:20:30.000Z', 'date')).toBe('2024-05-01')
        expect(formatCellValue('2024-05-01T10:20:30.000Z', 'datetime')).toBe('2024-05-01 10:20:30')
    })

    it('空值显示空字符串', () => {
        expect(formatCellValue(null, 'string')).toBe('')
        expect(formatCellValue(undefined, 'number')).toBe('')
        expect(formatCellValue('', 'string')).toBe('')
    })
})

describe('搜索值序列化', () => {
    it('空搜索项被跳过', () => {
        const payload = buildFiltersPayload({order_no: '', amount: [], status: ''}, fields, 'AND')
        expect(payload.conditions).toEqual([])
    })

    it('普通条件按字段的 searchOp 生成', () => {
        const payload = buildFiltersPayload({order_no: 'SO2024', status: 'paid', amount: []}, fields, 'AND')
        expect(payload.conditions).toEqual([
            {field: 'order_no', op: 'like', value: 'SO2024'},
            {field: 'status', op: 'eq', value: 'paid'},
        ])
    })

    it('区间条件保留数组', () => {
        const payload = buildFiltersPayload({amount: [10, 100]}, fields, 'AND')
        expect(payload.conditions).toEqual([{field: 'amount', op: 'between', value: [10, 100]}])
    })

    it('in 条件支持逗号分隔字符串', () => {
        const inFields: TableField[] = [{name: 'status', label: '状态', type: 'string', searchable: true, searchOp: 'in'}]
        const payload = buildFiltersPayload({status: 'paid,shipped'}, inFields, 'AND')
        expect(payload.conditions).toEqual([{field: 'status', op: 'in', value: ['paid', 'shipped']}])
    })

    it('模式原样透传', () => {
        expect(buildFiltersPayload({}, fields, 'or').mode).toBe('OR')
        expect(buildFiltersPayload({}, fields, 'CUSTOM').mode).toBe('CUSTOM')
    })
})

describe('查询参数组装', () => {
    it('没有条件时不带 filters', () => {
        const params = buildQueryParams({page: 1, pageSize: 20, searchValues: {}, fields, mode: 'AND'})
        expect(params).toEqual({page: 1, pageSize: 20})
    })

    it('有条件时 filters 是 JSON 字符串', () => {
        const params = buildQueryParams({
            page: 2,
            pageSize: 10,
            searchValues: {status: 'paid'},
            fields,
            mode: 'AND',
        })
        expect(params.page).toBe(2)
        expect(typeof params.filters).toBe('string')
        expect(JSON.parse(params.filters as string)).toEqual({
            mode: 'AND',
            conditions: [{field: 'status', op: 'eq', value: 'paid'}],
        })
    })

    it('页码和每页条数做兜底与上限', () => {
        expect(buildQueryParams({page: 0, pageSize: 0, searchValues: {}, fields}).page).toBe(1)
        expect(clampPageSize(999)).toBe(200)
        expect(clampPageSize(0, 20)).toBe(20)
        expect(clampPageSize('abc', 15)).toBe(15)
    })
})

describe('表单初始值', () => {
    it('按字段类型给初始值', () => {
        const model = buildEmptyForm(fields)
        expect(model.order_no).toBe('')
        expect(model.amount).toBeUndefined()
        expect(buildEmptyForm([{name: 'ok', label: 'ok', type: 'boolean'}]).ok).toBe(false)
    })

    it('搜索初始值：区间是数组', () => {
        const values = defaultSearchValues(fields)
        expect(values.amount).toEqual([])
        expect(values.status).toBe('')
    })
})
