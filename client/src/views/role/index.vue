<template>
  <div class="page-card">
    <div class="toolbar">
      <div>
        <h3 style="margin: 0">角色管理</h3>
        <span class="text-muted">当前系统：{{ auth.activeSystemCode || auth.user?.systemName }}</span>
      </div>
      <el-button type="primary" @click="openCreate">新建角色</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="code" label="角色编码" width="150" />
      <el-table-column prop="name" label="角色名称" width="150" />
      <el-table-column label="权限数量" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ (row.permissions || []).length }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="用户数" width="100">
        <template #default="{ row }">{{ row._count?.users ?? 0 }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建角色' : '编辑角色'" width="720px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色编码" required>
          <el-input v-model="form.code" :disabled="mode === 'edit'" placeholder="大写字母开头，如 SALES_ADMIN" />
        </el-form-item>
        <el-form-item label="角色名称" required>
          <el-input v-model="form.name" placeholder="如：销售管理员" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>

        <el-form-item label="权限">
          <div class="permission-box">
            <div v-for="group in permissionGroups" :key="group" class="permission-group">
              <div class="permission-group-title">{{ group }}</div>
              <el-checkbox-group v-model="form.permissions">
                <el-checkbox v-for="item in groupedPermissions[group] || []" :key="item.code" :value="item.code">
                  {{ item.name }}
                  <span class="text-muted">（{{ item.code }}）</span>
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 角色管理。
 *
 * 角色的本质就是「一堆权限码」。用户绑定角色后：
 *   - 登录时权限码被签进 token
 *   - 后端守卫按权限码拦截接口
 *   - 前端按权限码决定菜单和按钮显不显示
 *
 * 注意：
 *   权限码清单必须和后端 ALL_PERMISSIONS 一致。
 *   这里从后端 /api/roles/permissions 拉，避免前后端两份清单写歪。
 */
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { roleApi } from "@/api";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const loading = ref(false);
const list = ref<any[]>([]);
const permissionList = ref<any[]>([]);
const permissionGroups = ref<string[]>([]);

const dialogVisible = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);

const form = reactive({
  code: "",
  name: "",
  remark: "",
  permissions: [] as string[],
});

/** 按分组整理权限，页面上分栏展示，比一长条勾选框好用 */
const groupedPermissions = computed(() => {
  const map: Record<string, any[]> = {};
  for (const item of permissionList.value) {
    if (!map[item.group]) map[item.group] = [];
    map[item.group].push(item);
  }
  return map;
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [roles, permissions] = await Promise.all([roleApi.list(), roleApi.permissions()]);
    list.value = roles.list || [];
    permissionList.value = permissions.list || [];
    permissionGroups.value = permissions.groups || [];
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  mode.value = "create";
  editingId.value = "";
  Object.assign(form, { code: "", name: "", remark: "", permissions: [] });
  dialogVisible.value = true;
}

function openEdit(row: any): void {
  mode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    remark: row.remark || "",
    permissions: [...(row.permissions || [])],
  });
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning("请填写角色名称");
    return;
  }
  if (mode.value === "create" && !form.code.trim()) {
    ElMessage.warning("请填写角色编码");
    return;
  }

  submitting.value = true;
  try {
    if (mode.value === "create") {
      await roleApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        remark: form.remark,
        permissions: form.permissions,
      });
      ElMessage.success("角色已创建");
    } else {
      await roleApi.update(editingId.value, {
        name: form.name.trim(),
        remark: form.remark,
        permissions: form.permissions,
      });
      ElMessage.success("修改成功。已登录的用户需要重新登录才会生效");
    }
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function remove(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」吗？`, "提示", {
      type: "warning",
    });
  } catch {
    return;
  }
  await roleApi.remove(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<style scoped>
.permission-box {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 12px;
  width: 100%;
}

.permission-group {
  padding: 6px 0;
  border-bottom: 1px dashed #ebeef5;
}

.permission-group:last-child {
  border-bottom: none;
}

.permission-group-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: #303133;
}
</style>
