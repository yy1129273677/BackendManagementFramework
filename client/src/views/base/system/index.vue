<template>
  <div class="page-card">
    <div class="toolbar">
      <div>
        <h3 style="margin: 0">子系统管理</h3>
        <span class="text-muted">主系统只有一个超管；每个子系统是给客户用的独立后台，靠系统编码区分。</span>
      </div>
      <el-button type="primary" @click="openCreate">新建子系统</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="code" label="系统编码" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.isMain" type="danger" size="small">main</el-tag>
          <code v-else>{{ row.code }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
      <el-table-column label="数据量" width="220">
        <template #default="{ row }">
          <span class="text-muted">
            用户 {{ row._count?.users ?? 0 }} ｜路由 {{ row._count?.routes ?? 0 }} ｜表格 {{ row._count?.tables ?? 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? "启用" : "停用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="enterSystem(row)">
            {{ row.isMain ? "回到主系统" : "进入配置" }}
          </el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="!row.isMain" link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建子系统' : '编辑子系统'" width="520px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="系统编码" required>
          <el-input
            v-model="form.code"
            :disabled="mode === 'edit'"
            placeholder="小写字母开头，如 demo、shop2；登录时要用"
          />
          <div class="text-muted">编码创建后不可修改（改了已登录用户和前端配置都会失效）。</div>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：演示子系统" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="这个子系统给谁用、干什么" />
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
 * 子系统（租户）管理。
 *
 * 只有超管能进来（菜单按 system:manage 权限过滤，后端接口也会再校验一次）。
 *
 * 关键操作「进入配置」：
 *   点了之后顶部上下文切到这个子系统，接下来在「表格配置 / 路由 / 用户 / 角色 / 字典」
 *   里做的所有改动都会落到这个子系统上，不会污染主系统。
 */
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { systemApi } from "@/api";
import router, { setupDynamicRoutes } from "@/router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const loading = ref(false);
const list = ref<any[]>([]);
const dialogVisible = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);

const form = reactive({
  code: "",
  name: "",
  remark: "",
  status: 1,
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await systemApi.list();
    list.value = result.list || [];
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  mode.value = "create";
  editingId.value = "";
  Object.assign(form, { code: "", name: "", remark: "", status: 1 });
  dialogVisible.value = true;
}

function openEdit(row: any): void {
  mode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    remark: row.remark || "",
    status: row.status,
  });
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning("请填写子系统名称");
    return;
  }
  if (mode.value === "create" && !form.code.trim()) {
    ElMessage.warning("请填写系统编码");
    return;
  }

  submitting.value = true;
  try {
    if (mode.value === "create") {
      const created = await systemApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        remark: form.remark,
      });
      ElMessage.success(`创建成功，系统编码：${(created as any).code}`);
    } else {
      await systemApi.update(editingId.value, {
        name: form.name.trim(),
        remark: form.remark,
        status: form.status,
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
    await ElMessageBox.confirm(
      `删除子系统「${row.name}」会连带删除它的用户、角色、路由、表格配置，并且会 DROP 掉业务数据表，数据不可恢复。确定继续吗？`,
      "危险操作确认",
      {
        type: "error",
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }

  await systemApi.remove(row.id);

  // 删除的正是「当前正在配置」的子系统时，必须先把上下文切回主系统：
  // 否则后续请求还会带 X-System-Code=<已删除的系统编码>，后端一律返回 404「子系统不存在」，
  // 表现就是「删除成功了但列表不刷新、还弹一条看不懂的错误」。
  const deletingActive = auth.activeSystemCode === row.code;
  if (deletingActive) {
    auth.setActiveSystem("");
    // 左侧菜单是跟着当前子系统动态加载的，也要重新按主系统拉一次，
    // 避免已删除子系统的菜单还留在页面上。
    try {
      await setupDynamicRoutes(router);
    } catch {
      // 菜单刷新失败不影响下面的列表刷新
    }
  }

  ElMessage.success(deletingActive ? "已删除，已切回主系统" : "已删除");
  await load();
}

/**
 * 进入某个子系统进行配置。
 * 实现方式：把上下文切过去然后整页刷新（动态路由、菜单都要重新加载）。
 */
function enterSystem(row: any): void {
  auth.setActiveSystem(row.isMain ? "" : row.code);
  window.location.hash = "#/dashboard";
  window.location.reload();
}

onMounted(load);
</script>
