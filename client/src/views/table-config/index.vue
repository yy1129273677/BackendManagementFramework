<script setup lang="ts">
/**
 * 表格配置（TCID 设计器）—— 这套系统最核心的页面。
 *
 * 在这里配一张表，等于同时干了两件事：
 *   1. 后端建一张真实的物理表（字段即数据库列）
 *   2. 存一份「说明书」到 sys_table_config，并用 TCID 编号
 * 之后前端一个 <Table :tcid="TCID" /> 就能把这张表渲染出来。
 *
 * 页面上四块：
 *   ① 基本信息（名称、搜索模式、每页条数）
 *   ② 字段列表（列名=数据库列名、是否显示、是否可搜索、搜索方式、是否必填…）
 *   ③ 操作列（新增/修改/删除的开关 + 各自需要的权限码）
 *   ④ 自定义按钮（label 给人看，value 给 slot 用）
 */
import {onMounted, reactive, ref} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {tableConfigApi} from '@/api'
import {useAuthStore} from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

/** 设计器里的字段行（比后端存储多两个前端用的字段：dictCode、locked） */
interface DesignerField {
    name: string
    label: string
    type: string
    visible: boolean
    searchable: boolean
    searchOp: string
    editable: boolean
    required: boolean
    width?: number
    dictCode: string
    /** 编辑已有表格时，老字段的列名不允许改（改了等于新增一列，老数据没了） */
    locked?: boolean
}

interface DesignerAction {
    label: string
    value: string
    permission: string
    type: string
    confirm: boolean
}

const FIELD_TYPES = [
    {value: 'string', label: '单行文本'},
    {value: 'text', label: '多行文本'},
    {value: 'number', label: '数字（小数）'},
    {value: 'integer', label: '整数'},
    {value: 'boolean', label: '是/否'},
    {value: 'date', label: '日期'},
    {value: 'datetime', label: '日期时间'},
    {value: 'json', label: 'JSON'},
]

const SEARCH_OPS = [
    {value: 'eq', label: '等于'},
    {value: 'ne', label: '不等于'},
    {value: 'like', label: '模糊包含'},
    {value: 'notLike', label: '不包含'},
    {value: 'gt', label: '大于'},
    {value: 'gte', label: '大于等于'},
    {value: 'lt', label: '小于'},
    {value: 'lte', label: '小于等于'},
    {value: 'in', label: '在列表中'},
    {value: 'notIn', label: '不在列表中'},
    {value: 'between', label: '区间'},
    {value: 'isNull', label: '为空'},
    {value: 'notNull', label: '不为空'},
]

const SEARCH_MODES = [
    {value: 'AND', label: 'AND（所有搜索条件同时满足）'},
    {value: 'OR', label: 'OR（任一条件满足即可）'},
    {value: 'CUSTOM', label: 'CUSTOM（前端可传任意 AND/OR/NOT 组合）'},
]

const loading = ref(false)
const list = ref<any[]>([])
const keyword = ref('')

const designerVisible = ref(false)
const designerMode = ref<'create' | 'edit'>('create')
const editingTcid = ref('')
const saving = ref(false)

const resultVisible = ref(false)
const createdTcid = ref('')

const form = reactive({
    name: '',
    remark: '',
    searchMode: 'AND',
    pageSize: 20,
    fields: [] as DesignerField[],
    operations: {
        create: true,
        update: true,
        delete: true,
        createPermission: 'data:create',
        updatePermission: 'data:update',
        deletePermission: 'data:delete',
    },
    customActions: [] as DesignerAction[],
})

// ---------------- 列表 ----------------
async function load(): Promise<void> {
    loading.value = true
    try {
        const result = await tableConfigApi.list(keyword.value || undefined)
        list.value = result.list || []
    } finally {
        loading.value = false
    }
}

// ---------------- 设计器 ----------------
function emptyField(index: number): DesignerField {
    return {
        name: '',
        label: '',
        type: 'string',
        visible: true,
        searchable: index === 0,
        searchOp: 'like',
        editable: true,
        required: false,
        width: undefined,
        dictCode: '',
        locked: false,
    }
}

function resetForm(): void {
    form.name = ''
    form.remark = ''
    form.searchMode = 'AND'
    form.pageSize = 20
    form.fields = [emptyField(0)]
    form.operations = {
        create: true,
        update: true,
        delete: true,
        createPermission: 'data:create',
        updatePermission: 'data:update',
        deletePermission: 'data:delete',
    }
    form.customActions = []
}

function openCreate(): void {
    designerMode.value = 'create'
    editingTcid.value = ''
    resetForm()
    designerVisible.value = true
}

async function openEdit(row: any): Promise<void> {
    const detail = await tableConfigApi.detail(row.tcid)
    designerMode.value = 'edit'
    editingTcid.value = detail.tcid
    form.name = detail.name || ''
    form.remark = detail.remark || ''
    form.searchMode = detail.searchMode || 'AND'
    form.pageSize = detail.pageSize || 20
    form.fields = (detail.fields || []).map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        visible: field.visible !== false,
        searchable: field.searchable === true,
        searchOp: field.searchOp || 'eq',
        editable: field.editable !== false,
        required: field.required === true,
        width: field.width,
        dictCode: field.options?.dict || '',
        // 已有字段锁住列名和类型：改名/改类型会丢数据，后端也会拒绝
        locked: true,
    }))
    const operations = detail.operations || {}
    form.operations = {
        create: operations.create !== false,
        update: operations.update !== false,
        delete: operations.delete !== false,
        createPermission: operations.createPermission || 'data:create',
        updatePermission: operations.updatePermission || 'data:update',
        deletePermission: operations.deletePermission || 'data:delete',
    }
    form.customActions = (detail.customActions || []).map((action: any) => ({
        label: action.label,
        value: action.value,
        permission: action.permission || '',
        type: action.type || 'primary',
        confirm: Boolean(action.confirm),
    }))
    designerVisible.value = true
}

function addField(): void {
    form.fields.push(emptyField(form.fields.length))
}

function removeField(index: number): void {
    form.fields.splice(index, 1)
}

function addAction(): void {
    form.customActions.push({label: '', value: '', permission: '', type: 'primary', confirm: false})
}

function removeAction(index: number): void {
    form.customActions.splice(index, 1)
}

async function save(): Promise<void> {
    if (!form.name.trim()) {
        ElMessage.warning('请填写表格名称')
        return
    }
    if (form.fields.length === 0) {
        ElMessage.warning('至少需要一个字段')
        return
    }
    for (const field of form.fields) {
        if (!field.name.trim()) {
            ElMessage.warning('有字段没有填字段名（字段名就是数据库列名）')
            return
        }
        if (!field.label.trim()) {
            ElMessage.warning(`字段「${field.name}」没有填标签`)
            return
        }
    }

    const payload = {
        name: form.name.trim(),
        remark: form.remark,
        searchMode: form.searchMode,
        pageSize: Number(form.pageSize) || 20,
        fields: form.fields.map((field, index) => ({
            name: field.name.trim(),
            label: field.label.trim(),
            type: field.type,
            visible: field.visible,
            searchable: field.searchable,
            searchOp: field.searchOp,
            editable: field.editable,
            required: field.required,
            width: field.width || undefined,
            sort: index,
            options: field.dictCode ? {dict: field.dictCode.trim()} : undefined,
        })),
        operations: {...form.operations},
        customActions: form.customActions
            .filter((action) => action.label.trim() && action.value.trim())
            .map((action) => ({
                label: action.label.trim(),
                value: action.value.trim(),
                permission: action.permission.trim() || undefined,
                type: action.type,
                confirm: action.confirm,
            })),
    }

    saving.value = true
    try {
        if (designerMode.value === 'create') {
            const created = await tableConfigApi.create(payload)
            createdTcid.value = created.tcid
            designerVisible.value = false
            resultVisible.value = true
            await load()
        } else {
            await tableConfigApi.update(editingTcid.value, payload)
            ElMessage.success('配置已更新')
            designerVisible.value = false
            await load()
        }
    } catch {
        // 错误信息已由拦截器弹出；这里保持弹窗打开，方便用户改完再存
    } finally {
        saving.value = false
    }
}

// ---------------- 其它操作 ----------------
async function remove(row: any): Promise<void> {
    try {
        await ElMessageBox.confirm(
            `删除「${row.name}」会 DROP 掉物理表 ${row.physicalTable || 'biz_' + row.tcid.toLowerCase()}，表里的业务数据会一起消失且不可恢复。确定继续吗？`,
            '危险操作确认',
            {type: 'error', confirmButtonText: '确定删除', cancelButtonText: '取消'},
        )
    } catch {
        return
    }

    await tableConfigApi.remove(row.tcid)
    ElMessage.success('已删除')
    await load()
}

function preview(row: any): void {
    router.push(`/preview/${row.tcid}`)
}

async function copyTcid(tcid: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(tcid)
        ElMessage.success(`已复制：${tcid}`)
    } catch {
        // 非 https 环境下 clipboard 可能不可用，退化到提示手动复制
        ElMessage.info(`请手动复制：${tcid}`)
    }
}

function goCreateRoute(): void {
    resultVisible.value = false
    router.push('/route')
}

onMounted(load)
</script>

<template>
    <div class="page-card">
        <div class="toolbar">
            <div>
                <h3 style="margin: 0">表格配置（TCID）</h3>
                <span class="text-muted">
                    当前系统：{{ auth.activeSystemCode || auth.user?.systemName }}
                    ｜配置完会生成 TCID，前端 <code>&lt;Table :tcid="TCID" /&gt;</code> 即可渲染
                </span>
            </div>
            <div style="display: flex; gap: 8px">
                <el-input v-model="keyword" placeholder="搜索名称或 TCID" clearable style="width: 220px" @keyup.enter="load"/>
                <el-button @click="load">搜索</el-button>
                <el-button type="primary" @click="openCreate">新建表格配置</el-button>
            </div>
        </div>

        <el-table v-loading="loading" :data="list" border stripe>
            <el-table-column label="TCID" width="160">
                <template #default="{ row }">
                    <el-space :size="4">
                        <code class="tcid">{{ row.tcid }}</code>
                        <el-button link type="primary" size="small" @click="copyTcid(row.tcid)">复制</el-button>
                    </el-space>
                </template>
            </el-table-column>
            <el-table-column prop="name" label="表格名称" min-width="140"/>
            <el-table-column prop="physicalTable" label="物理表" width="180">
                <template #default="{ row }"><code>{{ row.physicalTable }}</code></template>
            </el-table-column>
            <el-table-column label="字段数" width="90">
                <template #default="{ row }">{{ row.fieldCount ?? (row.fields || []).length }}</template>
            </el-table-column>
            <el-table-column label="搜索模式" width="110">
                <template #default="{ row }">
                    <el-tag size="small" type="info">{{ row.searchMode }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column prop="pageSize" label="每页" width="80"/>
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip/>
            <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                    <el-button link type="primary" size="small" @click="preview(row)">预览</el-button>
                    <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>

        <!-- ============ 设计器 ============ -->
        <el-dialog
            v-model="designerVisible"
            :title="designerMode === 'create' ? '新建表格配置' : `编辑表格配置（${editingTcid}）`"
            width="1180px"
            top="4vh"
        >
            <el-alert
                v-if="designerMode === 'edit'"
                type="info"
                :closable="false"
                show-icon
                style="margin-bottom: 12px"
                title="编辑说明：可以新增字段（会 ADD COLUMN）；不能改已有字段的列名和类型（会丢数据，后端会拒绝）；从列表里移除的字段只是不再显示，物理列和数据仍保留。"
            />

            <el-form label-width="110px">
                <el-row :gutter="12">
                    <el-col :span="10">
                        <el-form-item label="表格名称" required>
                            <el-input v-model="form.name" placeholder="如：订单列表"/>
                        </el-form-item>
                    </el-col>
                    <el-col :span="8">
                        <el-form-item label="搜索模式">
                            <el-select v-model="form.searchMode" style="width: 100%">
                                <el-option v-for="item in SEARCH_MODES" :key="item.value" :label="item.label" :value="item.value"/>
                            </el-select>
                        </el-form-item>
                    </el-col>
                    <el-col :span="6">
                        <el-form-item label="每页条数">
                            <el-input-number v-model="form.pageSize" :min="1" :max="200" :controls="false" style="width: 100%"/>
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-form-item label="备注">
                    <el-input v-model="form.remark" placeholder="这张表是干什么的"/>
                </el-form-item>

                <!-- 字段列表 -->
                <el-form-item label="字段配置">
                    <div style="width: 100%">
                        <el-table :data="form.fields" border size="small" max-height="320">
                            <el-table-column label="字段名(列名)" width="150">
                                <template #default="{ row }">
                                    <el-input v-model="row.name" size="small" :disabled="row.locked" placeholder="order_no"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="标签" width="130">
                                <template #default="{ row }">
                                    <el-input v-model="row.label" size="small" placeholder="订单号"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="类型" width="130">
                                <template #default="{ row }">
                                    <el-select v-model="row.type" size="small" :disabled="row.locked">
                                        <el-option v-for="item in FIELD_TYPES" :key="item.value" :label="item.label" :value="item.value"/>
                                    </el-select>
                                </template>
                            </el-table-column>
                            <el-table-column label="显示" width="60">
                                <template #default="{ row }">
                                    <el-switch v-model="row.visible" size="small"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="可搜索" width="70">
                                <template #default="{ row }">
                                    <el-switch v-model="row.searchable" size="small"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="搜索方式" width="130">
                                <template #default="{ row }">
                                    <el-select v-model="row.searchOp" size="small" :disabled="!row.searchable">
                                        <el-option v-for="item in SEARCH_OPS" :key="item.value" :label="item.label" :value="item.value"/>
                                    </el-select>
                                </template>
                            </el-table-column>
                            <el-table-column label="可编辑" width="70">
                                <template #default="{ row }">
                                    <el-switch v-model="row.editable" size="small"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="必填" width="60">
                                <template #default="{ row }">
                                    <el-switch v-model="row.required" size="small"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="列宽" width="90">
                                <template #default="{ row }">
                                    <el-input-number v-model="row.width" size="small" :min="60" :controls="false" style="width: 100%"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="字典编码" width="130">
                                <template #default="{ row }">
                                    <el-input v-model="row.dictCode" size="small" placeholder="如 order_status"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="操作" width="70" fixed="right">
                                <template #default="{ $index }">
                                    <el-button link type="danger" size="small" @click="removeField($index)">删除</el-button>
                                </template>
                            </el-table-column>
                        </el-table>
                        <el-button style="margin-top: 8px" size="small" @click="addField">+ 添加字段</el-button>
                        <span class="text-muted" style="margin-left: 8px">
                            字段名就是数据库列名：小写字母开头，只能含小写字母、数字、下划线
                        </span>
                    </div>
                </el-form-item>

                <!-- 操作列权限 -->
                <el-form-item label="操作列配置">
                    <div style="width: 100%">
                        <el-row :gutter="8">
                            <el-col :span="8">
                                <div class="op-row">
                                    <el-checkbox v-model="form.operations.create">允许新增</el-checkbox>
                                    <el-input v-model="form.operations.createPermission" size="small" placeholder="权限码 data:create"/>
                                </div>
                            </el-col>
                            <el-col :span="8">
                                <div class="op-row">
                                    <el-checkbox v-model="form.operations.update">允许修改</el-checkbox>
                                    <el-input v-model="form.operations.updatePermission" size="small" placeholder="权限码 data:update"/>
                                </div>
                            </el-col>
                            <el-col :span="8">
                                <div class="op-row">
                                    <el-checkbox v-model="form.operations.delete">允许删除</el-checkbox>
                                    <el-input v-model="form.operations.deletePermission" size="small" placeholder="权限码 data:delete"/>
                                </div>
                            </el-col>
                        </el-row>
                    </div>
                </el-form-item>

                <!-- 自定义按钮 -->
                <el-form-item label="自定义按钮">
                    <div style="width: 100%">
                        <el-table :data="form.customActions" border size="small">
                            <el-table-column label="按钮文字（label）" width="180">
                                <template #default="{ row }">
                                    <el-input v-model="row.label" size="small" placeholder="标记发货"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="标识（value → 插槽 action-<value>）" width="230">
                                <template #default="{ row }">
                                    <el-input v-model="row.value" size="small" placeholder="ship"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="需要的权限码（可空）" width="200">
                                <template #default="{ row }">
                                    <el-input v-model="row.permission" size="small" placeholder="data:update"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="样式" width="120">
                                <template #default="{ row }">
                                    <el-select v-model="row.type" size="small">
                                        <el-option label="主色" value="primary"/>
                                        <el-option label="成功" value="success"/>
                                        <el-option label="警告" value="warning"/>
                                        <el-option label="危险" value="danger"/>
                                    </el-select>
                                </template>
                            </el-table-column>
                            <el-table-column label="二次确认" width="90">
                                <template #default="{ row }">
                                    <el-switch v-model="row.confirm" size="small"/>
                                </template>
                            </el-table-column>
                            <el-table-column label="操作" width="70">
                                <template #default="{ $index }">
                                    <el-button link type="danger" size="small" @click="removeAction($index)">删除</el-button>
                                </template>
                            </el-table-column>
                        </el-table>
                        <el-button style="margin-top: 8px" size="small" @click="addAction">+ 添加按钮</el-button>
                        <span class="text-muted" style="margin-left: 8px">
                            前端用 <code>&lt;template #action-ship="{ row }"&gt;</code> 接管点击逻辑
                        </span>
                    </div>
                </el-form-item>
            </el-form>

            <template #footer>
                <el-button @click="designerVisible = false">取消</el-button>
                <el-button type="primary" :loading="saving" @click="save">保存</el-button>
            </template>
        </el-dialog>

        <!-- 创建成功后展示 TCID -->
        <el-dialog v-model="resultVisible" title="配置已保存" width="520px">
            <el-result icon="success" title="表格配置已创建">
                <template #sub-title>
                    <p>系统已为这张表生成唯一编号（TCID），并把配置写入数据库。</p>
                </template>
                <template #extra>
                    <el-space direction="vertical" alignment="center">
                        <el-tag size="large" type="success" class="result-tcid">{{ createdTcid }}</el-tag>
                        <el-space>
                            <el-button @click="copyTcid(createdTcid)">复制 TCID</el-button>
                            <el-button type="primary" @click="goCreateRoute">去创建路由</el-button>
                        </el-space>
                        <div class="text-muted">
                            前端页面里写：<code>&lt;Table :tcid="'{{ createdTcid }}'" /&gt;</code>
                        </div>
                    </el-space>
                </template>
            </el-result>
        </el-dialog>
    </div>
</template>

<style scoped>
.tcid {
    color: #409eff;
    font-weight: 600;
}

.op-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    padding: 8px;
}

.result-tcid {
    font-size: 20px;
    letter-spacing: 2px;
    padding: 8px 20px;
}

code {
    background: #f5f7fa;
    padding: 1px 5px;
    border-radius: 3px;
}
</style>
