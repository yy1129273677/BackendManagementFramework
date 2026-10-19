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
      <el-table-column label="菜单名称" width="150">
        <template #default="{ row }">
          <el-space :size="6">
            <el-icon v-if="row.icon">
              <component :is="row.icon" />
            </el-icon>
            <span>{{ row.title }}</span>
          </el-space>
        </template>
      </el-table-column>
      <el-table-column prop="path" label="路径" width="170">
        <template #default="{ row }">
          <code>{{ row.path }}</code>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="row.type === 'TABLE' ? 'success' : 'warning'" size="small">
            {{ row.type === "TABLE" ? "表格" : "自定义" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="绑定内容" min-width="190">
        <template #default="{ row }">
          <code v-if="row.type === 'TABLE'">{{ row.tcid }}</code>
          <code v-else>{{ row.componentPath }}</code>
        </template>
      </el-table-column>
      <el-table-column label="访问控制" width="110">
        <template #default="{ row }">
          <el-tag :type="row.accessType === 'ROLE' ? 'warning' : 'info'" size="small">
            {{ row.accessType === "ROLE" ? "按角色" : "公开" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="JSON 配置" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.config" type="success" size="small">已配置</el-tag>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="显示" width="80">
        <template #default="{ row }">
          <el-tag :type="row.visible ? 'success' : 'info'" size="small">{{ row.visible ? "显示" : "隐藏" }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sort" label="排序" width="70" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建路由' : '编辑路由'" width="720px" top="5vh">
      <el-form :model="form" label-width="120px">
        <el-form-item label="菜单名称" required>
          <el-input v-model="form.title" placeholder="如：订单管理" />
        </el-form-item>
        <el-form-item label="路径" required>
          <el-input v-model="form.path" placeholder="如：/order/list（必须以 / 开头，子系统内唯一）" />
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
          <el-input v-model="form.componentPath" placeholder="如：examples/demo-table.vue" />
          <div class="text-muted">
            相对 <code>client/src/views</code> 的 .vue 文件路径。文件要先存在，否则打开会提示「页面找不到」。
          </div>
        </el-form-item>

        <el-form-item label="图标">
          <IconPicker v-model="form.icon" />
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :controls="false" />
        </el-form-item>

        <el-form-item label="访问控制">
          <el-radio-group v-model="form.accessType">
            <el-radio value="PUBLIC">公开（登录即可见）</el-radio>
            <el-radio value="ROLE">按角色（在角色权限树里勾选）</el-radio>
          </el-radio-group>
          <div class="text-muted">
            选「按角色」后，去「角色管理 → 编辑角色 → 权限树」勾上这个菜单，对应角色才能看到。 不再需要手填权限码。
          </div>
        </el-form-item>

        <el-form-item label="JSON 配置">
          <div style="width: 100%">
            <el-input
              v-model="form.configText"
              type="textarea"
              :rows="6"
              placeholder='{"title": "订单中心", "pageSize": 50}'
              spellcheck="false"
            />
            <div class="config-actions">
              <span class="text-muted">
                这个 JSON 会作为 props 注入前端页面：自定义页面写
                <code>defineProps&lt;{ routeConfig?: any }&gt;()</code>
                就能拿到，不用改代码就能调参数。
              </span>
              <el-space>
                <el-button link type="primary" size="small" @click="formatConfig">格式化</el-button>
                <el-button link type="danger" size="small" @click="form.configText = ''">清空</el-button>
              </el-space>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="是否显示">
          <el-switch v-model="form.visible" active-text="显示" inactive-text="隐藏" />
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
 * 路由（菜单）管理。
 *
 * 需求 002 涉及三处：
 *   1. 图标选择改成弹层平铺网格（IconPicker），一行多个图标、直接显示图形
 *   2. 去掉手填「访问权限码」，改成「访问控制：公开 / 按角色」——
 *      按角色的菜单在「角色管理 → 权限树」里勾选，权限码 menu:<routeId> 由系统生成
 *   3. 新增 JSON 配置，注入给前端页面（自定义页面通过 props.routeConfig 接收）
 */
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { routeApi, tableConfigApi } from "@/api";
import { useAuthStore } from "@/stores/auth";
import IconPicker from "@/components/IconPicker/index.vue";

const auth = useAuthStore();

const loading = ref(false);
const list = ref<any[]>([]);
const tableConfigs = ref<any[]>([]);

const dialogVisible = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);

const form = reactive({
  title: "",
  path: "",
  type: "TABLE" as "CUSTOM" | "TABLE",
  componentPath: "",
  tcid: "",
  icon: "Menu",
  sort: 0,
  visible: true,
  accessType: "PUBLIC" as "PUBLIC" | "ROLE",
  configText: "",
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [routes, configs] = await Promise.all([routeApi.list(), tableConfigApi.list()]);
    list.value = routes.list || [];
    tableConfigs.value = configs.list || [];
  } finally {
    loading.value = false;
  }
}

function resetForm(): void {
  Object.assign(form, {
    title: "",
    path: "",
    type: "TABLE",
    componentPath: "",
    tcid: tableConfigs.value[0]?.tcid || "",
    icon: "Menu",
    sort: 0,
    visible: true,
    accessType: "PUBLIC",
    configText: "",
  });
}

function openCreate(): void {
  mode.value = "create";
  editingId.value = "";
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: any): void {
  mode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    title: row.title,
    path: row.path,
    type: row.type,
    componentPath: row.componentPath || "",
    tcid: row.tcid || "",
    icon: row.icon || "Menu",
    sort: row.sort || 0,
    visible: row.visible,
    accessType: row.accessType === "ROLE" ? "ROLE" : "PUBLIC",
    configText: row.config ? JSON.stringify(row.config, null, 2) : "",
  });
  dialogVisible.value = true;
}

/** 把 JSON 配置格式化一下，方便人看 */
function formatConfig(): void {
  const text = form.configText.trim();
  if (!text) return;
  try {
    form.configText = JSON.stringify(JSON.parse(text), null, 2);
    ElMessage.success("已格式化");
  } catch {
    ElMessage.error("JSON 格式不正确，无法格式化");
  }
}

async function submit(): Promise<void> {
  if (!form.title.trim()) {
    ElMessage.warning("请填写菜单名称");
    return;
  }
  if (!form.path.trim().startsWith("/")) {
    ElMessage.warning("路径必须以 / 开头");
    return;
  }
  if (form.type === "TABLE" && !form.tcid) {
    ElMessage.warning("表格路由必须选择 TCID");
    return;
  }
  if (form.type === "CUSTOM" && !form.componentPath.trim()) {
    ElMessage.warning("自定义页面必须填写前端文件路径");
    return;
  }

  // JSON 配置：空 = 不配置；有内容必须能解析（后端也会再校验一次）
  let config: any = null;
  if (form.configText.trim()) {
    try {
      config = JSON.parse(form.configText);
    } catch {
      ElMessage.error("JSON 配置不是合法的 JSON，请检查引号和逗号");
      return;
    }
  }

  const payload = {
    title: form.title.trim(),
    path: form.path.trim(),
    type: form.type,
    componentPath: form.type === "CUSTOM" ? form.componentPath.trim() : null,
    tcid: form.type === "TABLE" ? form.tcid : null,
    icon: form.icon || null,
    sort: Number(form.sort) || 0,
    visible: form.visible,
    accessType: form.accessType,
    config,
  };

  submitting.value = true;
  try {
    if (mode.value === "create") {
      await routeApi.create(payload);
      ElMessage.success("路由已创建，刷新后菜单生效");
    } else {
      await routeApi.update(editingId.value, payload);
      ElMessage.success("修改成功，刷新后菜单生效");
    }
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function remove(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除路由「${row.title}」吗？`, "提示", {
      type: "warning",
    });
  } catch {
    return;
  }
  await routeApi.remove(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<style lang="less" scoped>
.config-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

code {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
