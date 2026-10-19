<template>
  <div class="page-card">
    <div class="toolbar">
      <div>
        <h3 style="margin: 0">用户管理</h3>
        <span class="text-muted">当前系统：{{ auth.activeSystemCode || auth.user?.systemName }}</span>
      </div>
      <div style="display: flex; gap: 8px">
        <el-input
          v-model="keyword"
          placeholder="搜索用户名/昵称"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <el-button @click="handleSearch">搜索</el-button>
        <el-button type="primary" @click="openCreate">新建用户</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="username" label="用户名" width="160" />
      <el-table-column prop="nickname" label="昵称" width="160" />
      <el-table-column label="角色" width="160">
        <template #default="{ row }">
          <el-tag v-if="row.role" size="small">{{ row.role.name }}</el-tag>
          <span v-else class="text-muted">未分配</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? "启用" : "停用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" min-width="180">
        <template #default="{ row }">{{ String(row.createdAt).replace("T", " ").slice(0, 19) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="display: flex; justify-content: flex-end; margin-top: 12px">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @size-change="load"
        @current-change="load"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建用户' : '编辑用户'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="mode === 'edit'" placeholder="字母开头，3~32 位" />
        </el-form-item>
        <el-form-item :label="mode === 'create' ? '初始密码' : '重置密码'" :required="mode === 'create'">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="mode === 'create' ? '至少 6 位' : '留空表示不修改'"
          />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="显示在页面右上角" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleId" clearable placeholder="选择角色" style="width: 100%">
            <el-option v-for="item in roles" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="mode === 'edit'" label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="停用"
          />
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
 * 用户管理（当前子系统内的用户）。
 *
 * 注意「当前子系统」：
 *   超管在主系统里看到的是主系统的用户；
 *   顶栏切到 demo 子系统后，这里就是 demo 的用户。数据互相隔离。
 */
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { roleApi, userApi } from "@/api";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref("");
const roles = ref<any[]>([]);

const dialogVisible = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);

const form = reactive({
  username: "",
  password: "",
  nickname: "",
  roleId: "",
  status: 1,
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await userApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
    });
    list.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

async function loadRoles(): Promise<void> {
  const result = await roleApi.list();
  roles.value = result.list || [];
}

function openCreate(): void {
  mode.value = "create";
  editingId.value = "";
  Object.assign(form, {
    username: "",
    password: "",
    nickname: "",
    roleId: roles.value[0]?.id || "",
    status: 1,
  });
  dialogVisible.value = true;
}

function openEdit(row: any): void {
  mode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    username: row.username,
    password: "",
    nickname: row.nickname || "",
    roleId: row.roleId || "",
    status: row.status,
  });
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.username.trim()) {
    ElMessage.warning("请填写用户名");
    return;
  }
  if (mode.value === "create" && !form.password) {
    ElMessage.warning("请填写初始密码");
    return;
  }

  submitting.value = true;
  try {
    if (mode.value === "create") {
      await userApi.create({
        username: form.username.trim(),
        password: form.password,
        nickname: form.nickname.trim() || undefined,
        roleId: form.roleId || undefined,
      });
      ElMessage.success("用户已创建");
    } else {
      await userApi.update(editingId.value, {
        nickname: form.nickname.trim(),
        roleId: form.roleId || null,
        status: form.status,
        password: form.password || undefined,
      });
      ElMessage.success("修改成功");
    }
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function remove(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除用户「${row.username}」吗？`, "提示", {
      type: "warning",
    });
  } catch {
    return;
  }
  await userApi.remove(row.id);
  ElMessage.success("已删除");
  await load();
}

function handleSearch(): void {
  page.value = 1;
  load();
}

onMounted(async () => {
  await loadRoles();
  await load();
});
</script>
