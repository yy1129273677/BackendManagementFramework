<script setup lang="ts">
/**
 * 业务字典管理。
 *
 * 左边是字典类型（比如「订单状态」），右边是这个类型下的选项（待付款/已付款/...）。
 *
 * 为什么要字典：
 *   表格配置里的下拉字段可以引用字典编码，选项改动不需要改代码发版。
 */
import {onMounted, reactive, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {dictApi} from '@/api'
import {useAuthStore} from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const types = ref<any[]>([])
const selectedType = ref<any>(null)
const items = ref<any[]>([])

const typeDialogVisible = ref(false)
const typeMode = ref<'create' | 'edit'>('create')
const typeEditingId = ref('')
const typeForm = reactive({code: '', name: '', remark: ''})

const itemDialogVisible = ref(false)
const itemMode = ref<'create' | 'edit'>('create')
const itemEditingId = ref('')
const itemForm = reactive({label: '', value: '', sort: 0, status: 1})

const submitting = ref(false)

async function loadTypes(): Promise<void> {
    loading.value = true
    try {
        const result = await dictApi.types()
        types.value = result.list || []
        if (!selectedType.value && types.value.length > 0) {
            await selectType(types.value[0])
        }
    } finally {
        loading.value = false
    }
}

async function selectType(type: any): Promise<void> {
    selectedType.value = type
    const result = await dictApi.items(type.id)
    items.value = result.list || []
}

function openTypeCreate(): void {
    typeMode.value = 'create'
    typeEditingId.value = ''
    Object.assign(typeForm, {code: '', name: '', remark: ''})
    typeDialogVisible.value = true
}

function openTypeEdit(type: any): void {
    typeMode.value = 'edit'
    typeEditingId.value = type.id
    Object.assign(typeForm, {code: type.code, name: type.name, remark: type.remark || ''})
    typeDialogVisible.value = true
}

async function submitType(): Promise<void> {
    if (typeMode.value === 'create' && !typeForm.code.trim()) return ElMessage.warning('请填写字典编码')
    if (!typeForm.name.trim()) return ElMessage.warning('请填写字典名称')

    submitting.value = true
    try {
        if (typeMode.value === 'create') {
            await dictApi.createType({code: typeForm.code.trim(), name: typeForm.name.trim(), remark: typeForm.remark})
            ElMessage.success('字典类型已创建')
        } else {
            await dictApi.updateType(typeEditingId.value, {name: typeForm.name.trim(), remark: typeForm.remark})
            ElMessage.success('修改成功')
        }
        typeDialogVisible.value = false
        selectedType.value = null
        await loadTypes()
    } finally {
        submitting.value = false
    }
}

async function removeType(type: any): Promise<void> {
    try {
        await ElMessageBox.confirm(`删除字典「${type.name}」会连带删除它下面所有选项，确定吗？`, '提示', {type: 'warning'})
    } catch {
        return
    }
    await dictApi.removeType(type.id)
    if (selectedType.value?.id === type.id) {
        selectedType.value = null
        items.value = []
    }
    ElMessage.success('已删除')
    await loadTypes()
}

function openItemCreate(): void {
    if (!selectedType.value) return ElMessage.warning('请先选择左边的字典类型')
    itemMode.value = 'create'
    itemEditingId.value = ''
    Object.assign(itemForm, {label: '', value: '', sort: items.value.length, status: 1})
    itemDialogVisible.value = true
}

function openItemEdit(item: any): void {
    itemMode.value = 'edit'
    itemEditingId.value = item.id
    Object.assign(itemForm, {label: item.label, value: item.value, sort: item.sort, status: item.status})
    itemDialogVisible.value = true
}

async function submitItem(): Promise<void> {
    if (!itemForm.label.trim() || !itemForm.value.trim()) {
        return ElMessage.warning('选项文字和值都不能为空')
    }

    submitting.value = true
    try {
        if (itemMode.value === 'create') {
            await dictApi.createItem({
                dictTypeId: selectedType.value.id,
                label: itemForm.label.trim(),
                value: itemForm.value.trim(),
                sort: Number(itemForm.sort) || 0,
            })
            ElMessage.success('选项已添加')
        } else {
            await dictApi.updateItem(itemEditingId.value, {
                label: itemForm.label.trim(),
                value: itemForm.value.trim(),
                sort: Number(itemForm.sort) || 0,
                status: itemForm.status,
            })
            ElMessage.success('修改成功')
        }
        itemDialogVisible.value = false
        await selectType(selectedType.value)
    } finally {
        submitting.value = false
    }
}

async function removeItem(item: any): Promise<void> {
    try {
        await ElMessageBox.confirm(`确定删除选项「${item.label}」吗？`, '提示', {type: 'warning'})
    } catch {
        return
    }
    await dictApi.removeItem(item.id)
    ElMessage.success('已删除')
    await selectType(selectedType.value)
}

onMounted(loadTypes)
</script>

<template>
    <div>
        <div class="page-card" style="margin-bottom: 12px">
            <div class="toolbar" style="margin-bottom: 0">
                <div>
                    <h3 style="margin: 0">业务字典</h3>
                    <span class="text-muted">当前系统：{{ auth.activeSystemCode || auth.user?.systemName }}</span>
                </div>
                <el-button type="primary" @click="openTypeCreate">新建字典类型</el-button>
            </div>
        </div>

        <el-row :gutter="12">
            <!-- 左：字典类型 -->
            <el-col :span="7">
                <div class="page-card">
                    <h4 style="margin-top: 0">字典类型</h4>
                    <el-empty v-if="types.length === 0" description="还没有字典类型" :image-size="60"/>
                    <div
                        v-for="type in types"
                        :key="type.id"
                        class="type-item"
                        :class="{active: selectedType?.id === type.id}"
                        @click="selectType(type)"
                    >
                        <div>
                            <div class="type-name">{{ type.name }}</div>
                            <code class="text-muted">{{ type.code }}</code>
                        </div>
                        <div class="type-actions">
                            <el-button link type="primary" size="small" @click.stop="openTypeEdit(type)">改</el-button>
                            <el-button link type="danger" size="small" @click.stop="removeType(type)">删</el-button>
                        </div>
                    </div>
                </div>
            </el-col>

            <!-- 右：字典选项 -->
            <el-col :span="17">
                <div class="page-card">
                    <div class="toolbar">
                        <h4 style="margin: 0">
                            选项
                            <span v-if="selectedType" class="text-muted">（{{ selectedType.name }}）</span>
                        </h4>
                        <el-button type="primary" size="small" @click="openItemCreate">添加选项</el-button>
                    </div>

                    <el-table v-loading="loading" :data="items" border stripe>
                        <el-table-column prop="label" label="显示文字" width="180"/>
                        <el-table-column prop="value" label="值" width="180">
                            <template #default="{ row }"><code>{{ row.value }}</code></template>
                        </el-table-column>
                        <el-table-column prop="sort" label="排序" width="90"/>
                        <el-table-column label="状态" width="100">
                            <template #default="{ row }">
                                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
                                    {{ row.status === 1 ? '启用' : '停用' }}
                                </el-tag>
                            </template>
                        </el-table-column>
                        <el-table-column label="操作" width="140">
                            <template #default="{ row }">
                                <el-button link type="primary" size="small" @click="openItemEdit(row)">编辑</el-button>
                                <el-button link type="danger" size="small" @click="removeItem(row)">删除</el-button>
                            </template>
                        </el-table-column>
                    </el-table>
                </div>
            </el-col>
        </el-row>

        <!-- 字典类型弹窗 -->
        <el-dialog v-model="typeDialogVisible" :title="typeMode === 'create' ? '新建字典类型' : '编辑字典类型'" width="480px">
            <el-form :model="typeForm" label-width="90px">
                <el-form-item label="编码" required>
                    <el-input v-model="typeForm.code" :disabled="typeMode === 'edit'" placeholder="如 order_status（小写+下划线）"/>
                </el-form-item>
                <el-form-item label="名称" required>
                    <el-input v-model="typeForm.name" placeholder="如 订单状态"/>
                </el-form-item>
                <el-form-item label="备注">
                    <el-input v-model="typeForm.remark" type="textarea" :rows="2"/>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="typeDialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submitType">保存</el-button>
            </template>
        </el-dialog>

        <!-- 字典选项弹窗 -->
        <el-dialog v-model="itemDialogVisible" :title="itemMode === 'create' ? '添加选项' : '编辑选项'" width="480px">
            <el-form :model="itemForm" label-width="90px">
                <el-form-item label="显示文字" required>
                    <el-input v-model="itemForm.label" placeholder="如 已付款"/>
                </el-form-item>
                <el-form-item label="值" required>
                    <el-input v-model="itemForm.value" placeholder="如 paid（存进数据库的值）"/>
                </el-form-item>
                <el-form-item label="排序">
                    <el-input-number v-model="itemForm.sort" :min="0" :controls="false"/>
                </el-form-item>
                <el-form-item v-if="itemMode === 'edit'" label="状态">
                    <el-switch v-model="itemForm.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用"/>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="itemDialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submitItem">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<style scoped>
.type-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid transparent;
}

.type-item:hover {
    background: #f5f7fa;
}

.type-item.active {
    background: #ecf5ff;
    border-color: #409eff;
}

.type-name {
    font-weight: 600;
}

.type-actions {
    display: flex;
    gap: 2px;
}
</style>
