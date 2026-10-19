<script setup lang="ts">
/**
 * 公用表格组件 <Table :tcid="xxx" />
 * ---------------------------------------------------------------------------
 * 干什么：
 *   给一个 TCID，组件自己去后端拿「表格配置」，然后把搜索栏、表格、分页、
 *   新增/编辑弹窗、操作按钮全部渲染出来。页面上不需要写任何字段相关的代码。
 *
 * 怎么用（最简）：
 *   <Table tcid="TDEMOORDERS" />
 *
 * 怎么自定义（插槽）：
 *   1. 自定义按钮：配置里给按钮设 value = 'ship'，
 *      页面写 <template #action-ship="{ row, action }"> ... </template>
 *   2. 自定义单元格：字段名 status → <template #col-status="{ row, value }">
 *      也可以用后端配置的 field.slot 名字。
 *
 * 注意：
 *   - 组件只负责「渲染 + 调接口」，业务逻辑（点自定义按钮做什么）留在页面里
 *   - 所有权限判断后端已经算进 config.operations 了，前端只管显示
 *   - 没有 data:read 权限时后端会 403，页面会弹出错误提示
 */
import {computed, onMounted, reactive, ref, watch} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {dictApi, tableDataApi} from '@/api'
import type {CustomAction, TableConfig, TableField, TableRow} from './types'
import {
    buildEmptyForm,
    buildQueryParams,
    clampPageSize,
    defaultSearchValues,
    formatCellValue,
    resolveActionSlotName,
} from './utils'

defineOptions({name: 'Table'})

const props = withDefaults(
    defineProps<{
        /** 表格配置编号，必填 */
        tcid: string
        /** 每页条数，不传则用配置里的默认值 */
        pageSize?: number
        /** 是否显示搜索栏 */
        showSearch?: boolean
        /** 表格高度，长表格建议传，比如 "520px" */
        height?: string
    }>(),
    {pageSize: 0, showSearch: true, height: ''},
)

const emit = defineEmits<{
    /** 点了自定义按钮（页面没接管插槽时会触发这个事件） */
    (e: 'action', payload: { value: string; row: TableRow; action: CustomAction }): void
    /** 数据加载完成 */
    (e: 'loaded', payload: { total: number }): void
}>()

// ---------------- 状态 ----------------
const configLoading = ref(false)
const loading = ref(false)
const config = ref<TableConfig | null>(null)
const loadError = ref('')
const rows = ref<TableRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const searchValues = reactive<Record<string, any>>({})
const dictOptions = reactive<Record<string, Array<{ label: string; value: string }>>>({})

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const submitting = ref(false)
const formModel = reactive<Record<string, any>>({})

// ---------------- 派生数据 ----------------
const columns = computed(() => config.value?.columns || [])
const searchFields = computed(() => config.value?.searchFields || [])
const formFields = computed(() => (config.value?.fields || []).filter((field) => field.editable !== false))
const operations = computed(() => config.value?.operations || {create: false, update: false, delete: false})
const customActions = computed(() => config.value?.customActions || [])

/** 操作列宽度：按实际会显示几个按钮动态算，避免按钮换行 */
const operationColumnWidth = computed(() => {
    let width = 24
    if (operations.value.update) width += 56
    if (operations.value.delete) width += 56
    width += customActions.value.length * 76
    return Math.max(120, width)
})

/**
 * 搜索项用什么控件渲染。
 * 规则：有选项（字典/静态）优先下拉；布尔用是/否；区间用范围；其余按类型。
 */
function searchControl(field: TableField): string {
    const hasOptions = Boolean(field.options?.dict || (field.options?.static && field.options.static.length > 0))
    if (hasOptions) return field.searchOp === 'in' || field.searchOp === 'notIn' ? 'multi-select' : 'select'
    if (field.type === 'boolean') return 'select'
    if (field.searchOp === 'between') {
        return field.type === 'date' || field.type === 'datetime' ? 'date-range' : 'number-range'
    }
    if (field.type === 'number' || field.type === 'integer') return 'number'
    if (field.type === 'date' || field.type === 'datetime') return 'date'
    return 'input'
}

/** 下拉选项：静态选项优先，其次用字典接口拿到的选项 */
function optionsFor(field: TableField): Array<{ label: string; value: any }> {
    if (field.options?.static?.length) return field.options.static
    const dictCode = field.options?.dict
    if (dictCode && dictOptions[dictCode]) return dictOptions[dictCode]
    if (field.type === 'boolean') {
        return [
            {label: '是', value: 'true'},
            {label: '否', value: 'false'},
        ]
    }
    return []
}

// ---------------- 数据加载 ----------------
async function loadConfig(): Promise<void> {
    configLoading.value = true
    loadError.value = ''
    try {
        const data = await tableDataApi.config(props.tcid)
        config.value = data
        pageSize.value = clampPageSize(props.pageSize || data.pageSize || 20)

        // 重置搜索表单的值
        Object.keys(searchValues).forEach((key) => delete searchValues[key])
        Object.assign(searchValues, defaultSearchValues(data.searchFields || []))

        await loadDictOptions()
    } catch (error: any) {
        loadError.value = error?.message || `无法加载 TCID「${props.tcid}」的配置`
        config.value = null
    } finally {
        configLoading.value = false
    }
}

/** 预加载所有字典字段的选项，渲染下拉框用 */
async function loadDictOptions(): Promise<void> {
    const codes = new Set<string>()
    for (const field of config.value?.fields || []) {
        if (field.options?.dict) codes.add(field.options.dict)
    }
    for (const code of codes) {
        if (dictOptions[code]) continue
        try {
            const result = await dictApi.itemsByCode(code)
            dictOptions[code] = result.items || []
        } catch {
            dictOptions[code] = []
        }
    }
}

async function loadData(): Promise<void> {
    if (!config.value) return
    loading.value = true
    try {
        const params = buildQueryParams({
            page: page.value,
            pageSize: pageSize.value,
            searchValues,
            fields: searchFields.value,
            mode: config.value.searchMode || 'AND',
        })
        const result = await tableDataApi.list(props.tcid, params)
        rows.value = result.list || []
        total.value = result.total || 0
        emit('loaded', {total: total.value})
    } catch (error) {
        rows.value = []
        total.value = 0
    } finally {
        loading.value = false
    }
}

/** 对外暴露：父组件可以 <Table ref="tableRef" /> 然后 tableRef.value.reload() */
async function reload(): Promise<void> {
    await loadConfig()
    await loadData()
}

// ---------------- 搜索 ----------------
function handleSearch(): void {
    page.value = 1
    loadData()
}

function handleReset(): void {
    Object.keys(searchValues).forEach((key) => delete searchValues[key])
    Object.assign(searchValues, defaultSearchValues(searchFields.value))
    page.value = 1
    loadData()
}

function handleSizeChange(size: number): void {
    pageSize.value = size
    page.value = 1
    loadData()
}

function handlePageChange(current: number): void {
    page.value = current
    loadData()
}

// ---------------- 新增 / 编辑 ----------------
function fillForm(source?: TableRow): void {
    const model = buildEmptyForm(formFields.value)
    Object.keys(formModel).forEach((key) => delete formModel[key])
    Object.assign(formModel, model)

    if (source) {
        for (const field of formFields.value) {
            const value = source[field.name]
            // 日期类字段要截成控件能识别的格式
            if (field.type === 'date' && value) formModel[field.name] = String(value).slice(0, 10)
            else if (field.type === 'datetime' && value) formModel[field.name] = String(value).replace('T', ' ').slice(0, 19)
            else formModel[field.name] = value ?? model[field.name]
        }
    }
}

function openCreate(): void {
    dialogMode.value = 'create'
    editingId.value = ''
    fillForm()
    dialogVisible.value = true
}

function openEdit(row: TableRow): void {
    dialogMode.value = 'edit'
    editingId.value = row.id
    fillForm(row)
    dialogVisible.value = true
}

async function submitForm(): Promise<void> {
    // 必填校验放在前端做是为了体验；后端同样会校验一次，不能只依赖前端
    for (const field of formFields.value) {
        if (!field.required) continue
        const value = formModel[field.name]
        if (value === '' || value === null || value === undefined) {
            ElMessage.warning(`请填写「${field.label}」`)
            return
        }
    }

    submitting.value = true
    try {
        if (dialogMode.value === 'create') {
            await tableDataApi.create(props.tcid, {...formModel})
            ElMessage.success('新增成功')
        } else {
            await tableDataApi.update(props.tcid, editingId.value, {...formModel})
            ElMessage.success('修改成功')
        }
        dialogVisible.value = false
        await loadData()
    } finally {
        submitting.value = false
    }
}

async function handleDelete(row: TableRow): Promise<void> {
    try {
        await ElMessageBox.confirm('删除后不可恢复，确定要删除这条数据吗？', '删除确认', {
            type: 'warning',
            confirmButtonText: '确定删除',
            cancelButtonText: '取消',
        })
    } catch {
        return // 用户点了取消
    }

    await tableDataApi.remove(props.tcid, row.id)
    ElMessage.success('已删除')

    // 删掉当前页最后一条时，退回上一页，避免停在空白页
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    await loadData()
}

// ---------------- 自定义按钮 ----------------
async function handleCustomAction(action: CustomAction, row: TableRow): Promise<void> {
    if (action.confirm) {
        try {
            await ElMessageBox.confirm(`确定要执行「${action.label}」吗？`, '操作确认', {type: 'warning'})
        } catch {
            return
        }
    }

    // 页面没写对应插槽时，退化成事件通知；页面也没监听就提示一下，避免「点了没反应」
    emit('action', {value: action.value, row, action})
}

// ---------------- 生命周期 ----------------
onMounted(async () => {
    await loadConfig()
    await loadData()
})

// 同一个页面里切换 TCID（比如通过路由参数）时自动重新加载
watch(
    () => props.tcid,
    async () => {
        page.value = 1
        await reload()
    },
)

defineExpose({reload, getConfig: () => config.value, getRows: () => rows.value})
</script>

<template>
    <div class="bmf-table">
        <!-- 配置加载失败：常见原因是 TCID 写错，或当前子系统里没有这张表 -->
        <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false"/>
        <template v-else>
            <!-- 搜索栏 -->
            <el-form
                v-if="showSearch && searchFields.length > 0"
                :inline="true"
                class="search-form"
                @submit.prevent
            >
                <el-form-item v-for="field in searchFields" :key="field.name" :label="field.label">
                    <!-- 下拉（字典 / 静态选项 / 布尔） -->
                    <el-select
                        v-if="searchControl(field) === 'select'"
                        v-model="searchValues[field.name]"
                        clearable
                        placeholder="全部"
                        style="width: 150px"
                    >
                        <el-option
                            v-for="option in optionsFor(field)"
                            :key="String(option.value)"
                            :label="option.label"
                            :value="option.value"
                        />
                    </el-select>

                    <!-- 多选 -->
                    <el-select
                        v-else-if="searchControl(field) === 'multi-select'"
                        v-model="searchValues[field.name]"
                        multiple
                        collapse-tags
                        clearable
                        placeholder="可多选"
                        style="width: 200px"
                    >
                        <el-option
                            v-for="option in optionsFor(field)"
                            :key="String(option.value)"
                            :label="option.label"
                            :value="option.value"
                        />
                    </el-select>

                    <!-- 日期区间 -->
                    <el-date-picker
                        v-else-if="searchControl(field) === 'date-range'"
                        v-model="searchValues[field.name]"
                        type="daterange"
                        value-format="YYYY-MM-DD"
                        start-placeholder="开始日期"
                        end-placeholder="结束日期"
                        style="width: 240px"
                    />

                    <!-- 数字区间 -->
                    <div v-else-if="searchControl(field) === 'number-range'" class="range-input">
                        <el-input-number
                            v-model="searchValues[field.name][0]"
                            :controls="false"
                            placeholder="最小"
                            style="width: 90px"
                        />
                        <span class="range-sep">~</span>
                        <el-input-number
                            v-model="searchValues[field.name][1]"
                            :controls="false"
                            placeholder="最大"
                            style="width: 90px"
                        />
                    </div>

                    <!-- 数字 -->
                    <el-input-number
                        v-else-if="searchControl(field) === 'number'"
                        v-model="searchValues[field.name]"
                        :controls="false"
                        placeholder="请输入"
                        style="width: 150px"
                    />

                    <!-- 日期 -->
                    <el-date-picker
                        v-else-if="searchControl(field) === 'date'"
                        v-model="searchValues[field.name]"
                        type="date"
                        value-format="YYYY-MM-DD"
                        placeholder="选择日期"
                        style="width: 150px"
                    />

                    <!-- 文本 -->
                    <el-input
                        v-else
                        v-model="searchValues[field.name]"
                        clearable
                        placeholder="请输入"
                        style="width: 160px"
                    />
                </el-form-item>

                <el-form-item>
                    <el-button type="primary" @click="handleSearch">搜索</el-button>
                    <el-button @click="handleReset">重置</el-button>
                </el-form-item>
            </el-form>

            <!-- 工具栏 -->
            <div class="toolbar">
                <div class="table-title">
                    <span>{{ config?.name || '数据列表' }}</span>
                    <span v-if="config" class="text-muted">TCID：{{ config.tcid }}</span>
                </div>
                <div>
                    <el-button v-if="operations.create" type="primary" @click="openCreate">新增</el-button>
                    <slot name="toolbar" :reload="loadData" :config="config"/>
                </div>
            </div>

            <!-- 数据表格 -->
            <el-table
                v-loading="loading || configLoading"
                :data="rows"
                border
                stripe
                :height="height || undefined"
                row-key="id"
            >
                <el-table-column
                    v-for="column in columns"
                    :key="column.name"
                    :prop="column.name"
                    :label="column.label"
                    :width="column.width"
                    :min-width="column.width ? undefined : 120"
                    show-overflow-tooltip
                >
                    <template #default="{ row }">
                        <!-- 页面接管了这个单元格的渲染 -->
                        <slot v-if="$slots[column.slot]" :name="column.slot" :row="row" :column="column" :value="row[column.name]"/>
                        <span v-else>{{ formatCellValue(row[column.name], column.type) }}</span>
                    </template>
                </el-table-column>

                <!-- 操作列 -->
                <el-table-column
                    v-if="operations.update || operations.delete || customActions.length > 0"
                    label="操作"
                    :width="operationColumnWidth"
                    fixed="right"
                >
                    <template #default="{ row }">
                        <el-button v-if="operations.update" link type="primary" size="small" @click="openEdit(row)">
                            编辑
                        </el-button>
                        <el-button v-if="operations.delete" link type="danger" size="small" @click="handleDelete(row)">
                            删除
                        </el-button>

                        <!-- 自定义按钮：页面写了 #action-<value> 插槽就由页面接管 -->
                        <template v-for="action in customActions" :key="action.value">
                            <slot
                                v-if="$slots[resolveActionSlotName(action.value)]"
                                :name="resolveActionSlotName(action.value)"
                                :row="row"
                                :action="action"
                                :reload="loadData"
                            />
                            <el-button
                                v-else
                                link
                                size="small"
                                :type="action.type === 'default' ? 'primary' : action.type"
                                @click="handleCustomAction(action, row)"
                            >
                                {{ action.label }}
                            </el-button>
                        </template>
                    </template>
                </el-table-column>

                <template #empty>
                    <el-empty description="暂无数据" :image-size="80"/>
                </template>
            </el-table>

            <!-- 分页 -->
            <div class="pagination">
                <el-pagination
                    v-model:current-page="page"
                    v-model:page-size="pageSize"
                    :total="total"
                    :page-sizes="[10, 20, 50, 100]"
                    layout="total, sizes, prev, pager, next, jumper"
                    background
                    @size-change="handleSizeChange"
                    @current-change="handlePageChange"
                />
            </div>
        </template>

        <!-- 新增 / 编辑弹窗 -->
        <el-dialog
            v-model="dialogVisible"
            :title="dialogMode === 'create' ? `新增 - ${config?.name || ''}` : `编辑 - ${config?.name || ''}`"
            width="560px"
            destroy-on-close
        >
            <el-form :model="formModel" label-width="110px">
                <el-form-item
                    v-for="field in formFields"
                    :key="field.name"
                    :label="field.label"
                    :required="field.required"
                >
                    <!-- 下拉 -->
                    <el-select
                        v-if="field.options?.dict || field.options?.static || field.type === 'boolean'"
                        v-model="formModel[field.name]"
                        clearable
                        style="width: 100%"
                    >
                        <el-option
                            v-for="option in optionsFor(field)"
                            :key="String(option.value)"
                            :label="option.label"
                            :value="option.value"
                        />
                    </el-select>

                    <!-- 数字 -->
                    <el-input-number
                        v-else-if="field.type === 'number' || field.type === 'integer'"
                        v-model="formModel[field.name]"
                        :precision="field.type === 'integer' ? 0 : 2"
                        :controls="false"
                        style="width: 100%"
                    />

                    <!-- 日期 -->
                    <el-date-picker
                        v-else-if="field.type === 'date'"
                        v-model="formModel[field.name]"
                        type="date"
                        value-format="YYYY-MM-DD"
                        style="width: 100%"
                    />

                    <!-- 日期时间 -->
                    <el-date-picker
                        v-else-if="field.type === 'datetime'"
                        v-model="formModel[field.name]"
                        type="datetime"
                        value-format="YYYY-MM-DD HH:mm:ss"
                        style="width: 100%"
                    />

                    <!-- 多行文本 -->
                    <el-input
                        v-else-if="field.type === 'text'"
                        v-model="formModel[field.name]"
                        type="textarea"
                        :rows="3"
                        style="width: 100%"
                    />

                    <!-- 单行文本 -->
                    <el-input v-else v-model="formModel[field.name]" clearable style="width: 100%"/>
                </el-form-item>
            </el-form>

            <template #footer>
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
.bmf-table {
    background: #fff;
    border-radius: 6px;
    padding: 16px;
}

.search-form {
    margin-bottom: 4px;
}

.table-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
}

.pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 12px;
}

.range-input {
    display: flex;
    align-items: center;
    gap: 4px;
}

.range-sep {
    color: #909399;
}
</style>
