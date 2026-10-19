<template>
  <div class="page-card">
    <div class="toolbar">
      <div>
        <h3 style="margin: 0">角色管理</h3>
        <span class="text-muted">
          当前系统：{{ auth.activeSystemCode || auth.user?.systemName }} ｜ 权限改成树形勾选：菜单 + 该菜单下表格的按钮
        </span>
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

    <el-dialog v-model="dialogVisible" :title="mode === 'create' ? '新建角色' : '编辑角色'" width="900px" top="4vh">
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
          <div class="tree-box">
            <div class="tree-toolbar">
              <span class="text-muted">
                勾选即可授权：菜单 = 能看到这个菜单（TABLE 菜单同时可读该表数据），菜单下的按钮 =
                在<b>这个路由下</b>能操作那张表。
                按钮权限按路由区分：同一张表挂在两条路由下时是两个独立权限，取消一个不影响另一个。父子不联动，按钮也不影响菜单。
              </span>
              <el-space>
                <el-button link type="primary" size="small" @click="checkAll">全选可授权项</el-button>
                <el-button link type="danger" size="small" @click="clearAll">清空</el-button>
              </el-space>
            </div>

            <el-tree
              ref="treeRef"
              :data="treeData"
              node-key="key"
              show-checkbox
              default-expand-all
              check-strictly
              :props="treeProps"
              class="perm-tree"
              :empty-text="treeLoading ? '加载权限树…' : '当前系统还没有可配置的菜单'"
            >
              <template #default="{ data }">
                <span class="tree-node">
                  <span>{{ data.title }}</span>
                  <span v-if="data.note" class="node-note">{{ data.note }}</span>
                </span>
              </template>
            </el-tree>
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
 * 需求 002 第 2 条：
 *   原来权限是一排看不懂的权限码勾选框（data:create / route:read…）。
 *   现在改成「权限树」：
 *     - 菜单节点：当前子系统里真实存在的路由，勾选 = 能看到这个菜单
 *     - 按钮节点：TABLE 路由下面挂这张表的「新增/修改/删除/自定义按钮」
 *   这样管理员看到的是「订单管理 / 新增」这种看得懂的东西。
 *
 * 树是后端 GET /api/roles/permission-tree 算出来的，返回：
 *   tree   —— 树结构
 *   keyMap —— 节点 key → 权限码（同一个权限码可能挂在多个节点上，所以要映射）
 *
 * 注意：
 *   角色的 permissions 存的仍然是权限码数组，只是录入方式从「手填/平铺勾选」变成了「树里勾选」。
 *   公开菜单（accessType=PUBLIC）和没配权限码的自定义按钮在树里是禁用态，勾不了。
 */
import { nextTick, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { roleApi } from "@/api";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();

const loading = ref(false);
const list = ref<any[]>([]);

const dialogVisible = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);

const treeRef = ref<any>();
const treeData = ref<any[]>([]);
const treeLoading = ref(false);
const keyMap = ref<Record<string, string>>({});
const treeProps = { label: "title", children: "children", disabled: "disabled" };

const form = reactive({
  code: "",
  name: "",
  remark: "",
  permissions: [] as string[],
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await roleApi.list();
    list.value = result.list || [];
  } finally {
    loading.value = false;
  }
}

/** 拉权限树（每次打开弹窗都重新拉，保证菜单/表格配置变动后是最新的） */
async function loadTree(): Promise<void> {
  treeLoading.value = true;
  try {
    const result = await roleApi.permissionTree();
    treeData.value = result.tree || [];
    keyMap.value = result.keyMap || {};
  } catch {
    treeData.value = [];
    keyMap.value = {};
  } finally {
    treeLoading.value = false;
  }
}

/** 权限码 → 节点 key（用来回显已勾选） */
function permissionsToKeys(permissions: string[]): string[] {
  const wanted = new Set(permissions || []);
  return Object.entries(keyMap.value)
    .filter(([, code]) => code && wanted.has(code))
    .map(([key]) => key);
}

/** 权限码 → 节点 key（用来回显已勾选） */

/** 遍历树，收集「可勾选」且带权限码的节点 key */
function collectCheckableKeys(nodes: any[], out: string[] = []): string[] {
  for (const node of nodes || []) {
    if (!node.disabled && node.code) out.push(node.key);
    if (node.children) collectCheckableKeys(node.children, out);
  }
  return out;
}

function checkAll(): void {
  treeRef.value?.setCheckedKeys(collectCheckableKeys(treeData.value), false);
}

function clearAll(): void {
  treeRef.value?.setCheckedKeys([], false);
}

async function openCreate(): Promise<void> {
  mode.value = "create";
  editingId.value = "";
  Object.assign(form, { code: "", name: "", remark: "", permissions: [] });
  dialogVisible.value = true;
  await loadTree();
  await nextTick();
  treeRef.value?.setCheckedKeys([], false);
}

async function openEdit(row: any): Promise<void> {
  mode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    remark: row.remark || "",
    permissions: [...(row.permissions || [])],
  });
  dialogVisible.value = true;
  await loadTree();
  await nextTick();
  treeRef.value?.setCheckedKeys(permissionsToKeys(form.permissions), false);
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

  // 从树上取勾选结果，再映射回权限码（去重：同一权限码可能挂在多个节点上）。
  //
  // 为什么要连 halfChecked 一起取：
  //   el-tree 父子联动时，如果只勾了父节点的一部分子节点，父节点会变成「半选」，
  //   getCheckedKeys() 不包含半选节点。之前只取 checked → 管理员「取消一个按钮」后，
  //   父节点的权限码被静默丢掉，表现成「只想关掉一个按钮，结果整个菜单没了」。
  //   半选节点里只有分组（code 为空）和菜单（code 有值）两种，分组会被 filter(Boolean) 过滤掉。
  const checkedKeys: string[] = [
    ...(treeRef.value?.getCheckedKeys() || []),
    ...(treeRef.value?.getHalfCheckedKeys() || []),
  ];
  const checkedCodes = [...new Set(checkedKeys.map((key) => keyMap.value[key]).filter(Boolean))];

  // 树上看不到的旧权限码要保留：比如老表格用的全局 data:create 已经从树里移除了。
  // 不保留的话，管理员打开角色点一下保存，就会把这些老权限静默删掉，老表的按钮直接失效。
  const visibleCodes = new Set(Object.values(keyMap.value));
  const legacyCodes = form.permissions.filter((code) => !visibleCodes.has(code));
  const permissions = [...new Set([...legacyCodes, ...checkedCodes])];

  submitting.value = true;
  try {
    if (mode.value === "create") {
      await roleApi.create({
        code: form.code.trim(),
        name: form.name.trim(),
        remark: form.remark,
        permissions,
      });
      ElMessage.success("角色已创建");
    } else {
      await roleApi.update(editingId.value, {
        name: form.name.trim(),
        remark: form.remark,
        permissions,
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
    await ElMessageBox.confirm(`确定删除角色「${row.name}」吗？`, "提示", { type: "warning" });
  } catch {
    return;
  }
  await roleApi.remove(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<style lang="less" scoped>
.tree-box {
  width: 100%;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}

.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: #fafafa;
  border-bottom: 1px dashed #ebeef5;
}

.perm-tree {
  max-height: 420px;
  overflow: auto;
  padding: 6px 8px;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-note {
  font-size: 11px;
  color: #b1b3b8;
}
</style>
