<template>
  <div class="page-card">
    <div class="toolbar">
      <div>
        <h3 style="margin: 0">表格配置（TCID）</h3>
        <span class="text-muted">
          当前系统：{{ auth.activeSystemCode || auth.user?.systemName }}
          ｜配置完会生成 TCID，前端
          <code>&lt;Table :tcid="TCID" /&gt;</code> 即可渲染
        </span>
      </div>
      <div style="display: flex; gap: 8px">
        <el-input v-model="keyword" placeholder="搜索名称或 TCID" clearable style="width: 220px" @keyup.enter="load" />
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
      <el-table-column prop="name" label="表格名称" min-width="140" />
      <el-table-column prop="physicalTable" label="物理表" width="180">
        <template #default="{ row }"
          ><code>{{ row.physicalTable }}</code></template
        >
      </el-table-column>
      <el-table-column label="字段数" width="90">
        <template #default="{ row }">{{ row.fieldCount ?? (row.fields || []).length }}</template>
      </el-table-column>
      <el-table-column label="搜索模式" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.searchMode }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="pageSize" label="每页" width="80" />
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" size="small" @click="preview(row)">预览</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- ============ 设计器 ============ -->
    <!-- 需求 002 第 5 条：一级弹框加宽（1180 → 1400），字段多时不用左右拖 -->
    <el-dialog
      v-model="designerVisible"
      :title="designerMode === 'create' ? '新建表格配置' : `编辑表格配置（${editingTcid}）`"
      width="1400px"
      top="3vh"
      :close-on-click-modal="false"
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
              <el-input v-model="form.name" placeholder="如：订单列表" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="搜索模式">
              <el-select v-model="form.searchMode" style="width: 100%">
                <el-option v-for="item in SEARCH_MODES" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="每页条数">
              <el-input-number v-model="form.pageSize" :min="1" :max="200" :controls="false" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="这张表是干什么的" />
        </el-form-item>

        <!-- 界面配置：一段 JSON，配表格高度和新增/编辑弹框的长宽 -->
        <el-form-item label="界面配置">
          <div style="width: 100%">
            <el-input
              v-model="form.configText"
              type="textarea"
              :rows="7"
              spellcheck="false"
              placeholder='例如 {"table":{"height":700},"form":{"dialog":{"width":1200,"height":960}}}'
            />
            <div class="config-hint">
              <span>
                目前支持
                <code>table.height</code>
                （表格高度）、
                <code>form.dialog.width</code>
                /
                <code>form.dialog.height</code>
                （新增·编辑弹框的宽高），单位都是像素；不写就用默认值。
              </span>
              <span>
                <el-button link type="primary" size="small" @click="formatConfigText">格式化</el-button>
                <el-button link type="primary" size="small" @click="resetConfigText">恢复默认</el-button>
              </span>
            </div>
          </div>
        </el-form-item>

        <!-- 字段列表 -->
        <el-form-item label="字段配置">
          <div style="width: 100%">
            <el-table :data="form.fields" border size="small" max-height="340">
              <el-table-column label="字段名(列名)" width="140" fixed>
                <template #default="{ row }">
                  <el-input v-model="row.name" size="small" :disabled="row.locked" placeholder="order_no" />
                </template>
              </el-table-column>
              <el-table-column label="标签" width="110">
                <template #default="{ row }">
                  <el-input v-model="row.label" size="small" placeholder="订单号" />
                </template>
              </el-table-column>
              <el-table-column label="类型" width="110">
                <template #default="{ row }">
                  <el-select v-model="row.type" size="small" :disabled="row.locked">
                    <el-option v-for="item in FIELD_TYPES" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="显示" width="56">
                <template #default="{ row }">
                  <el-switch v-model="row.visible" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="可搜索" width="64">
                <template #default="{ row }">
                  <el-switch v-model="row.searchable" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="搜索方式" width="110">
                <template #default="{ row }">
                  <el-select v-model="row.searchOp" size="small" :disabled="!row.searchable">
                    <el-option v-for="item in SEARCH_OPS" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="可编辑" width="64">
                <template #default="{ row }">
                  <el-switch v-model="row.editable" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="列宽" width="76">
                <template #default="{ row }">
                  <el-input-number v-model="row.width" size="small" :min="60" :controls="false" style="width: 100%" />
                </template>
              </el-table-column>
              <!-- 需求 002 第 5 条：列表排序 / 搜索排序 -->
              <el-table-column label="列表排序" width="80">
                <template #default="{ row }">
                  <el-input-number v-model="row.listSort" size="small" :controls="false" style="width: 100%" />
                </template>
              </el-table-column>
              <el-table-column label="搜索排序" width="80">
                <template #default="{ row }">
                  <el-input-number v-model="row.searchSort" size="small" :controls="false" style="width: 100%" />
                </template>
              </el-table-column>
              <!-- 字典编码改成下拉（数据来自业务字典类型） -->
              <el-table-column label="字典编码" width="150">
                <template #default="{ row }">
                  <el-select v-model="row.dictCode" size="small" clearable filterable placeholder="不用字典">
                    <el-option
                      v-for="item in dictTypes"
                      :key="item.code"
                      :label="`${item.name}（${item.code}）`"
                      :value="item.code"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="表单" width="88">
                <template #default="{ $index }">
                  <el-button link type="primary" size="small" @click="openFormConfig($index)">表单配置</el-button>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="64" fixed="right">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="removeField($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button style="margin-top: 8px" size="small" @click="addField">+ 添加字段</el-button>
            <span class="text-muted" style="margin-left: 8px">
              字段名就是数据库列名：小写字母开头，只能含小写字母、数字、下划线。表单排序/显示/栅格/校验在「表单配置」里设。
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
                  <el-input v-model="form.operations.createPermission" size="small" placeholder="权限码 data:create" />
                </div>
              </el-col>
              <el-col :span="8">
                <div class="op-row">
                  <el-checkbox v-model="form.operations.update">允许修改</el-checkbox>
                  <el-input v-model="form.operations.updatePermission" size="small" placeholder="权限码 data:update" />
                </div>
              </el-col>
              <el-col :span="8">
                <div class="op-row">
                  <el-checkbox v-model="form.operations.delete">允许删除</el-checkbox>
                  <el-input v-model="form.operations.deletePermission" size="small" placeholder="权限码 data:delete" />
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
                  <el-input v-model="row.label" size="small" placeholder="标记发货" />
                </template>
              </el-table-column>
              <el-table-column label="标识（value → 插槽 action-<value>）" width="230">
                <template #default="{ row }">
                  <el-input v-model="row.value" size="small" placeholder="ship" />
                </template>
              </el-table-column>
              <el-table-column label="需要的权限码（可空）" width="200">
                <template #default="{ row }">
                  <el-input v-model="row.permission" size="small" placeholder="data:update" />
                </template>
              </el-table-column>
              <el-table-column label="样式" width="120">
                <template #default="{ row }">
                  <el-select v-model="row.type" size="small">
                    <el-option label="主色" value="primary" />
                    <el-option label="成功" value="success" />
                    <el-option label="警告" value="warning" />
                    <el-option label="危险" value="danger" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="二次确认" width="90">
                <template #default="{ row }">
                  <el-switch v-model="row.confirm" size="small" />
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
              前端用
              <code>&lt;template #action-ship="{ row }"&gt;</code> 接管点击逻辑
            </span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="designerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 二级弹框：单个字段的表单配置（需求 002 第 5 条） -->
    <el-dialog
      v-model="formConfigVisible"
      :title="`表单配置 - ${activeFormField?.label || activeFormField?.name || ''}`"
      width="640px"
      append-to-body
    >
      <el-form v-if="activeFormField" label-width="110px">
        <el-form-item label="表单排序">
          <el-input-number v-model="activeFormField.formSort" :controls="false" />
          <span class="text-muted" style="margin-left: 8px">默认与列表排序相同</span>
        </el-form-item>

        <el-form-item label="是否显示">
          <el-switch v-model="activeFormField.formVisible" active-text="显示" inactive-text="隐藏" />
          <span class="text-muted" style="margin-left: 8px">关掉后表单里不出现这个字段（数据仍保留）</span>
        </el-form-item>

        <el-form-item label="所占列">
          <el-select v-model="activeFormField.formSpan" style="width: 260px">
            <el-option :value="24" label="24（整行，默认）" />
            <el-option :value="12" label="12（半行，一行两个）" />
            <el-option :value="8" label="8（一行三个）" />
            <el-option :value="6" label="6（一行四个）" />
            <el-option :value="4" label="4（一行六个）" />
          </el-select>
          <span class="text-muted" style="margin-left: 8px">按 24 栅格算</span>
        </el-form-item>

        <el-form-item label="是否必填">
          <el-switch v-model="activeFormField.required" />
        </el-form-item>

        <el-divider content-position="left">验证规则</el-divider>

        <el-form-item label="内置正则">
          <el-select
            placeholder="选一个预设，自动填下面的正则和提示"
            clearable
            style="width: 100%"
            @change="applyPreset"
          >
            <el-option v-for="item in presetPatterns" :key="item.label" :label="item.label" :value="item.label" />
          </el-select>
        </el-form-item>

        <el-form-item label="正则">
          <el-input v-model="activeFormField.pattern" placeholder="如：^1[3-9]\d{9}$" spellcheck="false" />
          <div class="text-muted">留空表示不做格式校验；正则写错后端会拒绝保存</div>
        </el-form-item>

        <el-form-item label="错误提示">
          <el-input v-model="activeFormField.patternMessage" placeholder="如：请输入正确的手机号" />
        </el-form-item>

        <el-form-item label="自定义校验">
          <el-select v-model="activeFormField.validator" clearable placeholder="不启用" style="width: 100%">
            <el-option v-for="name in validatorNames" :key="name" :label="name" :value="name" />
          </el-select>
          <div class="text-muted">
            校验函数在 <code>client/src/components/table/validators.ts</code> 注册，能拿到整个表单做联动校验。 不直接存
            JS 代码是为了避免"配置即执行任意脚本"的安全问题。
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="primary" @click="formConfigVisible = false">完成</el-button>
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
 *   ⑤ 界面配置（一段 JSON：表格高度、新增/编辑弹框的长宽）
 */
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { dictApi, tableConfigApi } from "@/api";
import { PRESET_PATTERNS, listValidators } from "@/components/table/validators";
// 界面配置的默认值 / 合并逻辑和 <Table> 组件共用一份，避免两处默认值各写各的
import { resolveTableUiConfig } from "@/components/table/types";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();

/** 设计器里的字段行（比后端存储多两个前端用的字段：dictCode、locked） */
interface DesignerField {
  name: string;
  label: string;
  type: string;
  visible: boolean;
  searchable: boolean;
  searchOp: string;
  editable: boolean;
  required: boolean;
  width?: number;
  dictCode: string;
  /** 列表显示排序（需求 002 第 5 条） */
  listSort: number;
  /** 搜索栏排序 */
  searchSort: number;
  /** 表单排序（默认与列表排序相同） */
  formSort: number;
  /** 是否在表单里显示 */
  formVisible: boolean;
  /** 表单占宽（24 栅格制） */
  formSpan: number;
  /** 校验正则 */
  pattern: string;
  /** 校验失败提示 */
  patternMessage: string;
  /** 自定义校验器名字（前端 validators.ts 注册） */
  validator: string;
  /** 编辑已有表格时，老字段的列名不允许改（改了等于新增一列，老数据没了） */
  locked?: boolean;
}

interface DesignerAction {
  label: string;
  value: string;
  permission: string;
  type: string;
  confirm: boolean;
}

const FIELD_TYPES = [
  { value: "string", label: "单行文本" },
  { value: "text", label: "多行文本" },
  { value: "number", label: "数字（小数）" },
  { value: "integer", label: "整数" },
  { value: "boolean", label: "是/否" },
  { value: "date", label: "日期" },
  { value: "datetime", label: "日期时间" },
  { value: "json", label: "JSON" },
];

const SEARCH_OPS = [
  { value: "eq", label: "等于" },
  { value: "ne", label: "不等于" },
  { value: "like", label: "模糊包含" },
  { value: "notLike", label: "不包含" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "in", label: "在列表中" },
  { value: "notIn", label: "不在列表中" },
  { value: "between", label: "区间" },
  { value: "isNull", label: "为空" },
  { value: "notNull", label: "不为空" },
];

const SEARCH_MODES = [
  { value: "AND", label: "AND（所有搜索条件同时满足）" },
  { value: "OR", label: "OR（任一条件满足即可）" },
  { value: "CUSTOM", label: "CUSTOM（前端可传任意 AND/OR/NOT 组合）" },
];

const loading = ref(false);
const list = ref<any[]>([]);
const keyword = ref("");

/** 业务字典类型（字段的「字典编码」改下拉后要用） */
const dictTypes = ref<any[]>([]);
/** 已注册的自定义校验器名字 */
const validatorNames = ref<string[]>(listValidators());
/** 内置正则预设 */
const presetPatterns = PRESET_PATTERNS;

const designerVisible = ref(false);
const designerMode = ref<"create" | "edit">("create");
const editingTcid = ref("");
const saving = ref(false);

/** 二级弹框：单个字段的表单配置（需求 002 第 5 条） */
const formConfigVisible = ref(false);
const formConfigIndex = ref(-1);

const resultVisible = ref(false);
const createdTcid = ref("");

const form = reactive({
  name: "",
  remark: "",
  searchMode: "AND",
  pageSize: 20,
  fields: [] as DesignerField[],
  operations: {
    create: true,
    update: true,
    delete: true,
    createPermission: "data:create",
    updatePermission: "data:update",
    deletePermission: "data:delete",
  },
  customActions: [] as DesignerAction[],
  /** 界面配置的 JSON 原文（弹框里那个文本域的内容） */
  configText: "",
});

// ---------------- 列表 ----------------
async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await tableConfigApi.list(keyword.value || undefined);
    list.value = result.list || [];
  } finally {
    loading.value = false;
  }
}

// ---------------- 设计器 ----------------
function emptyField(index: number): DesignerField {
  return {
    name: "",
    label: "",
    type: "string",
    visible: true,
    searchable: index === 0,
    searchOp: "like",
    editable: true,
    required: false,
    width: undefined,
    dictCode: "",
    listSort: index,
    searchSort: index,
    formSort: index,
    formVisible: true,
    formSpan: 24,
    pattern: "",
    patternMessage: "",
    validator: "",
    locked: false,
  };
}

/**
 * 把界面配置转成「带缩进的 JSON 文本」，填进弹框的文本域。
 *
 * 干什么：
 *   后端存的 config 可能为空（表示没配过），也可能只配了一半。
 *   这里先和内置默认值合并，再格式化成 2 空格缩进的文本，
 *   超管打开弹框就能看到完整的写法，照着改即可。
 *
 * 参数：
 *   config - 后端返回的 config 原文，可以为空
 *
 * 返回：
 *   多行 JSON 字符串
 */
function configTextOf(config: any): string {
  return JSON.stringify(resolveTableUiConfig(config), null, 2);
}

/** 「格式化」按钮：把用户写乱的 JSON 重新排版，顺便暴露语法错误 */
function formatConfigText(): void {
  try {
    form.configText = JSON.stringify(JSON.parse(form.configText || "{}"), null, 2);
  } catch {
    ElMessage.error("不是合法的 JSON，请检查引号和逗号");
  }
}

/** 「恢复默认」按钮：回到内置默认值（表格 700、弹框 1200×960） */
function resetConfigText(): void {
  form.configText = configTextOf(null);
}

function resetForm(): void {
  form.name = "";
  form.remark = "";
  form.searchMode = "AND";
  form.pageSize = 20;
  form.fields = [emptyField(0)];
  form.operations = {
    create: true,
    update: true,
    delete: true,
    createPermission: "data:create",
    updatePermission: "data:update",
    deletePermission: "data:delete",
  };
  form.customActions = [];
  // 新建时预填一份默认界面配置，让超管看到能配哪些东西
  form.configText = configTextOf(null);
}

function openCreate(): void {
  designerMode.value = "create";
  editingTcid.value = "";
  resetForm();
  designerVisible.value = true;
}

async function openEdit(row: any): Promise<void> {
  const detail = await tableConfigApi.detail(row.tcid);
  designerMode.value = "edit";
  editingTcid.value = detail.tcid;
  form.name = detail.name || "";
  form.remark = detail.remark || "";
  form.searchMode = detail.searchMode || "AND";
  form.pageSize = detail.pageSize || 20;
  // 界面配置：库里可能为空（没配过），此时显示内置默认值
  form.configText = configTextOf(detail.config);
  form.fields = (detail.fields || []).map((field: any) => ({
    name: field.name,
    label: field.label,
    type: field.type,
    visible: field.visible !== false,
    searchable: field.searchable === true,
    searchOp: field.searchOp || "eq",
    editable: field.editable !== false,
    required: field.required === true,
    width: field.width,
    dictCode: field.options?.dict || "",
    listSort: field.listSort ?? field.sort ?? 0,
    searchSort: field.searchSort ?? field.sort ?? 0,
    formSort: field.formSort ?? field.listSort ?? field.sort ?? 0,
    formVisible: field.formVisible !== false,
    formSpan: field.formSpan || 24,
    pattern: field.rules?.pattern || "",
    patternMessage: field.rules?.message || "",
    validator: field.rules?.validator || "",
    // 已有字段锁住列名和类型：改名/改类型会丢数据，后端也会拒绝
    locked: true,
  }));
  const operations = detail.operations || {};
  form.operations = {
    create: operations.create !== false,
    update: operations.update !== false,
    delete: operations.delete !== false,
    createPermission: operations.createPermission || "data:create",
    updatePermission: operations.updatePermission || "data:update",
    deletePermission: operations.deletePermission || "data:delete",
  };
  form.customActions = (detail.customActions || []).map((action: any) => ({
    label: action.label,
    value: action.value,
    permission: action.permission || "",
    type: action.type || "primary",
    confirm: Boolean(action.confirm),
  }));
  designerVisible.value = true;
}

function addField(): void {
  form.fields.push(emptyField(form.fields.length));
}

function removeField(index: number): void {
  form.fields.splice(index, 1);
}

function addAction(): void {
  form.customActions.push({
    label: "",
    value: "",
    permission: "",
    type: "primary",
    confirm: false,
  });
}

function removeAction(index: number): void {
  form.customActions.splice(index, 1);
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning("请填写表格名称");
    return;
  }
  if (form.fields.length === 0) {
    ElMessage.warning("至少需要一个字段");
    return;
  }
  for (const field of form.fields) {
    if (!field.name.trim()) {
      ElMessage.warning("有字段没有填字段名（字段名就是数据库列名）");
      return;
    }
    if (!field.label.trim()) {
      ElMessage.warning(`字段「${field.name}」没有填标签`);
      return;
    }
  }

  // 界面配置是手写的 JSON，先在这里把它解析成对象；
  // 写错了当场拦住，不要等后端返回 400（更细的校验——字段名对不对、数值范围——在后端做）
  let uiConfig: any = null;
  if (form.configText.trim()) {
    try {
      uiConfig = JSON.parse(form.configText);
    } catch {
      ElMessage.error("界面配置不是合法的 JSON，请检查引号和逗号");
      return;
    }
  }

  const payload = {
    name: form.name.trim(),
    remark: form.remark,
    searchMode: form.searchMode,
    pageSize: Number(form.pageSize) || 20,
    // 文本域清空时传 null，表示「没配过」，前端会用内置默认值
    config: uiConfig,
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
      // 需求 002 第 5 条：列表/搜索/表单各自的排序 + 表单显示与栅格 + 校验规则
      listSort: Number(field.listSort) || 0,
      searchSort: Number(field.searchSort) || 0,
      formSort: Number(field.formSort) || 0,
      formVisible: field.formVisible,
      formSpan: Number(field.formSpan) || 24,
      rules:
        field.pattern || field.validator
          ? {
              pattern: field.pattern.trim() || undefined,
              message: field.patternMessage.trim() || undefined,
              validator: field.validator.trim() || undefined,
            }
          : undefined,
      options: field.dictCode ? { dict: field.dictCode.trim() } : undefined,
    })),
    operations: { ...form.operations },
    customActions: form.customActions
      .filter((action) => action.label.trim() && action.value.trim())
      .map((action) => ({
        label: action.label.trim(),
        value: action.value.trim(),
        permission: action.permission.trim() || undefined,
        type: action.type,
        confirm: action.confirm,
      })),
  };

  saving.value = true;
  try {
    if (designerMode.value === "create") {
      const created = await tableConfigApi.create(payload);
      createdTcid.value = created.tcid;
      designerVisible.value = false;
      resultVisible.value = true;
      await load();
    } else {
      await tableConfigApi.update(editingTcid.value, payload);
      ElMessage.success("配置已更新");
      designerVisible.value = false;
      await load();
    }
  } catch {
    // 错误信息已由拦截器弹出；这里保持弹窗打开，方便用户改完再存
  } finally {
    saving.value = false;
  }
}

// ---------------- 表单配置二级弹框（需求 002 第 5 条）----------------
/** 打开某个字段的表单配置弹框 */
function openFormConfig(index: number): void {
  formConfigIndex.value = index;
  formConfigVisible.value = true;
}

/** 二级弹框正在编辑的字段（直接改 form.fields 里的对象，保存时一并提交） */
const activeFormField = computed<DesignerField | null>(() => form.fields[formConfigIndex.value] || null);

/** 选一个内置正则预设，自动填好正则和提示 */
function applyPreset(value: string): void {
  const preset = presetPatterns.find((item: any) => item.label === value);
  const field = activeFormField.value;
  if (!preset || !field) return;
  field.pattern = preset.pattern;
  field.patternMessage = preset.message;
}

/** 拉业务字典类型，给「字典编码」下拉用 */
async function loadDictTypes(): Promise<void> {
  try {
    const result = await dictApi.types();
    dictTypes.value = result.list || [];
  } catch {
    dictTypes.value = [];
  }
}

// ---------------- 其它操作 ----------------
async function remove(row: any): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除「${row.name}」会 DROP 掉物理表 ${row.physicalTable || "biz_" + row.tcid.toLowerCase()}，表里的业务数据会一起消失且不可恢复。确定继续吗？`,
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

  await tableConfigApi.remove(row.tcid);
  ElMessage.success("已删除");
  await load();
}

function preview(row: any): void {
  router.push(`/preview/${row.tcid}`);
}

async function copyTcid(tcid: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(tcid);
    ElMessage.success(`已复制：${tcid}`);
  } catch {
    // 非 https 环境下 clipboard 可能不可用，退化到提示手动复制
    ElMessage.info(`请手动复制：${tcid}`);
  }
}

function goCreateRoute(): void {
  resultVisible.value = false;
  router.push("/route");
}

onMounted(async () => {
  // 表格列表 + 字典类型（字段的「字典编码」下拉要用）+ 自定义校验器列表
  await load();
  await loadDictTypes();
  validatorNames.value = listValidators();
});
</script>

<style lang="less" scoped>
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

/* 界面配置文本域下面的说明行：左边是能配哪些字段，右边是两个小按钮 */
.config-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
</style>
