<script setup lang="ts">
/**
 * 路由（菜单）管理。
 *
 * 两种路由类型是本系统「快速交付」的关键：
 *   CUSTOM —— 指向一个手写 vue 文件的路径（如 examples/demo-table.vue）
 *   TABLE  —— 指向一个 TCID，页面自动渲染成配置出来的表格
 *
 * 保存后刷新页面，左侧菜单就会出现这一条。
 */
import {onMounted, reactive, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {routeApi, tableConfigApi} from '@/api'
import {useAuthStore} from '@/stores/auth'

const auth = useAuthStore()

const loading = ref(false)
const list = ref<any[]>([])
const tableConfigs = ref<any[]>([])

const dialogVisible = ref(false)
const mode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const submitting = ref(false)

const form = reactive({
    title: '',
    path: '',
    type: 'TABLE' as 'CUSTOM' | 'TABLE',
    componentPath: '',
    tcid: '',
    icon: 'Menu',
    sort: 0,
    visible: true,
    permissionCode: '',
})

async function load(): Promise<void> {
    loading.value = true
    try {
        const [routes, configs] = await Promise.all([routeApi.list(), tableConfigApi.list()])
        list.value = routes.list || []
        tableConfigs.value = configs.list || []
    } finally {
        loading.value = false
    }
}

function openCreate(): void {
    mode.value = 'create'
    editingId.value = ''
    Object.assign(form, {
        title: '',
        path: '',
        type: 'TABLE',
        componentPath: '',
        tcid: tableConfigs.value[0]?.tcid || '',
        icon: 'Menu',
        sort: 0,
        visible: true,
        permissionCode: '',
    })
    dialogVisible.value = true
}

function openEdit(row: any): void {
    mode.value = 'edit'
    editingId.value = row.id
    Object.assign(form, {
        title: row.title,
        path: row.path,
        type: row.type,
        componentPath: row.componentPath || '',
        tcid: row.tcid || '',
        icon: row.icon || 'Menu',
        sort: row.sort || 0,
        visible: row.visible,
        permissionCode: row.permissionCode || '',
    })
    dialogVisible.value = true
}

async function submit(): Promise<void> {
    if (!form.title.trim()) return ElMessage.warning('请填写菜单名称')
    if (!form.path.trim().startsWith('/')) return ElMessage.warning('路径必须以 / 开头')
    if (form.type === 'TABLE' && !form.tcid) return ElMessage.warning('表格路由必须选择 TCID')
    if (form.type === 'CUSTOM' && !form.componentPath.trim()) {
        return ElMessage.warning('自定义页面必须填写前端文件路径')
    }

    const payload = {
        title: form.title.trim(),
        path: form.path.trim(),
        type: form.type,
        componentPath: form.type === 'CUSTOM' ? form.componentPath.trim() : null,
        tcid: form.type === 'TABLE' ? form.tcid : null,
        icon: form.icon || null,
        sort: Number(form.sort) || 0,
        visible: form.visible,
        permissionCode: form.permissionCode || null,
    }

    submitting.value = true
    try {
        if (mode.value === 'create') {
            await routeApi.create(payload)
            ElMessage.success('路由已创建，刷新后菜单生效')
        } else {
            await routeApi.update(editingId.value, payload)
            ElMessage.success('修改成功，刷新后菜单生效')
        }
        dialogVisible.value = false
        await load()
    } finally {
        submitting.value = false
    }
}

async function remove(row: any): Promise<void> {
    try {
        await ElMessageBox.confirm(`确定删除路由「${row.title}」吗？`, '提示', {type: 'warning'})
    } catch {
        return
    }
    await routeApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
}

onMounted(load)
</script>

<template>
    <div class="page-card">
        <div class="toolbar">
            <div>
                <h3 style="margin: 0">路由管理</h3>
                <span class="text-muted">
                    当前操作的系统：{{ auth.activeSystemCode || auth.user?.systemName }}
                    ｜表格路由点菜单即可看到页面，自定义页面需要前端先写好 vue 文件
                </span>
            </div>
            <el-button type="primary" @click="openCreate">新建路由</el-button>
        </div>

        <el-table v-loading="loading" :data="list" border stripe>
            <el-table-column prop="title" label="菜单名称" width="160"/>
            <el-table-column prop="path" label="路径" width="180">
                <template #default="{ row }"><code>{{ row.path }}</code></template>
            </el-table-column>
            <el-table-column label="类型" width="110">
                <template #default="{ row }">
                    <el-tag :type="row.type === 'TABLE' ? 'success' : 'warning'" size="small">
                        {{ row.type === 'TABLE' ? '表格' : '自定义' }}
                    </el-tag>
                </template>
            </el-table-column>
            <el-table-column label="绑定内容" min-width="220">
                <template #default="{ row }">
                    <code v-if="row.type === 'TABLE'">{{ row.tcid }}</code>
                    <code v-else>{{ row.componentPath }}</code>
                </template>
            </el-table-column>
            <el-table-column prop="permissionCode" label="权限码" width="140">
                <template #default="{ row }">{{ row.permissionCode || '（登录即可见）' }}</template>
            </el-table-column>
            <el-table-column label="显示" width="80">
                <template #default="{ row }">
                    <el-tag :type="row.visible ? 'success' : 'info'" size="small">{{ row.visible ? '显示' : '隐藏' }}</el-tag>
                </template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="70"/>
            <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
                    <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
                </template>
            </el-table-column>
        </el-table>

        <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建路由' : '编辑路由'" width="640px">
            <el-form :model="form" label-width="120px">
                <el-form-item label="菜单名称" required>
                    <el-input v-model="form.title" placeholder="如：订单管理"/>
                </el-form-item>
                <el-form-item label="路径" required>
                    <el-input v-model="form.path" placeholder="如：/order/list（必须以 / 开头，子系统内唯一）"/>
                </el-form-item>
                <el-form-item label="路由类型" required>
                    <el-radio-group v-model="form.type">
                        <el-radio-button value="TABLE">表格页面（配 TCID）</el-radio-button>
                        <el-radio-button value="CUSTOM">自定义页面（配 vue 路径）</el-radio-button>
                    </el-radio-group>
                </el-form-item>

                <el-form-item v-if="form.type === 'TABLE'" label="表格 TCID" required>
                    <el-select v-model="form.tcid" placeholder="选择一个表格配置" style="width: 100%">
                        <el-option
                            v-for="item in tableConfigs"
                            :key="item.tcid"
                            :label="`${item.name}（${item.tcid}）`"
                            :value="item.tcid"
                        />
                    </el-select>
                    <div class="text-muted">还没有表格？先去「表格配置」新建一张，拿到 TCID 再回来。</div>
                </el-form-item>

                <el-form-item v-else label="前端文件路径" required>
                    <el-input v-model="form.componentPath" placeholder="如：examples/demo-table.vue"/>
                    <div class="text-muted">
                        相对 <code>client/src/views</code> 的 .vue 文件路径。文件要先存在，否则打开会提示「页面找不到」。
                    </div>
                </el-form-item>

                <el-form-item label="图标">
                    <el-input v-model="form.icon" placeholder="Element Plus 图标名，如 List / Grid / Menu"/>
                </el-form-item>
                <el-form-item label="排序">
                    <el-input-number v-model="form.sort" :min="0" :controls="false"/>
                </el-form-item>
                <el-form-item label="访问权限码">
                    <el-input v-model="form.permissionCode" placeholder="留空 = 登录即可见；如 data:read"/>
                    <div class="text-muted">填了之后，没有这个权限的用户看不到这条菜单。</div>
                </el-form-item>
                <el-form-item label="是否显示">
                    <el-switch v-model="form.visible" active-text="显示" inactive-text="隐藏"/>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>
