<template>
  <div class="bmf-table" :style="{ '--bmf-table-min-height': minHeight }">
    <!-- 配置加载失败：常见原因是 TCID 写错，或当前子系统里没有这张表 -->
    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false" />
    <template v-else>
      <!-- 搜索栏 -->
      <el-form v-if="showSearch && searchFields.length > 0" :inline="true" class="search-form" @submit.prevent>
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
          <el-input v-else v-model="searchValues[field.name]" clearable placeholder="请输入" style="width: 160px" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="table-title">
          <span>{{ config?.name || "数据列表" }}</span>
          <span v-if="config" class="text-muted">TCID：{{ config.tcid }}</span>
        </div>
        <div>
          <el-button v-if="operations.create" type="primary" @click="openCreate">新增</el-button>
          <slot name="toolbar" :reload="loadData" :config="config" />
        </div>
      </div>

      <!-- 数据表格 -->
      <!-- 高度来源（优先级从高到低）：组件 prop height > 后台界面配置 table.height；
           都没配时不设固定高度，改用下面的 min-height 兜底，空表时表格不至于塌成一条 -->
      <el-table
        v-loading="loading || configLoading"
        :data="rows"
        border
        stripe
        :height="tableHeight"
        :style="{ minHeight: tableHeight ? undefined : 'var(--bmf-table-min-height)' }"
        row-key="id"
      >
        <el-table-column
          v-for="column in columns"
          :key="column.name"
          :prop="column.name"
          :label="column.label"
          :width="column.width"
          :min-width="column.width ? undefined : 120"
          :align="column.align || 'left'"
          :header-align="column.align || 'left'"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <!-- 页面接管了这个单元格的渲染 -->
            <slot
              v-if="$slots[column.slot]"
              :name="column.slot"
              :row="row"
              :column="column"
              :value="row[column.name]"
            />
            <span v-else>{{ cellText(row, column) }}</span>
          </template>
        </el-table-column>

        <!-- 创建人：系统固定列，只在读/写范围生效为 ALL 时展示（后端已按当前用户折算） -->
        <el-table-column v-if="config?.showCreator" label="创建人" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.creatorName || "—" }}</template>
        </el-table-column>

        <!-- 操作列 -->
        <el-table-column
          v-if="operations.look || operations.update || operations.delete || customActions.length > 0"
          label="操作"
          :width="operationColumnWidth"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button v-if="operations.look" link type="primary" size="small" @click="openDetail(row)">
              详情
            </el-button>
            <el-button
              v-if="operations.update && canWriteRow(row)"
              link
              type="primary"
              size="small"
              @click="openEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="operations.delete && canWriteRow(row)"
              link
              type="danger"
              size="small"
              @click="handleDelete(row)"
            >
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
          <el-empty description="暂无数据" :image-size="80" />
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

    <!-- 新增 / 编辑弹窗。宽高来自后台界面配置；高度还会再和屏幕高度取小值，见 dialogStyle -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? `新增 - ${config?.name || ''}` : `编辑 - ${config?.name || ''}`"
      class="bmf-form-dialog"
      :width="dialogWidth"
      :style="dialogStyle"
      destroy-on-close
    >
      <!-- 表单支持自定义栅格：字段配置里设置「所占列」（24 栅格制），24=整行、12=一半 -->
      <el-form :model="formModel" label-width="110px">
        <el-row :gutter="12">
          <el-col v-for="field in formFields" :key="field.name" :span="field.formSpan || 24">
            <el-form-item :label="field.label" :required="field.required">
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
              <el-input v-else v-model="formModel[field.name]" clearable style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看详情：弹框宽高沿用编辑弹框的界面配置，内容用「表格样式」只读展示。
         字段的先后顺序、占宽（24 栅格）和必填红星都来自表单配置（formSort / formSpan / required）。 -->
    <el-dialog
      v-model="detailVisible"
      :title="`详情 - ${config?.name || ''}`"
      class="bmf-form-dialog bmf-detail-dialog"
      :width="dialogWidth"
      :style="dialogStyle"
      destroy-on-close
    >
      <el-empty v-if="detailFields.length === 0" description="没有可展示的字段" :image-size="80" />
      <div v-else class="detail-grid">
        <div
          v-for="field in detailFields"
          :key="field.name"
          class="detail-cell"
          :style="{ gridColumn: `span ${field.formSpan || 24}` }"
        >
          <div class="detail-label"><span v-if="field.required" class="detail-required">*</span>{{ field.label }}</div>
          <div class="detail-value">{{ detailValue(field) }}</div>
        </div>
      </div>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

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
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { dictApi, tableDataApi } from "@/api";
import { useAuthStore } from "@/stores/auth";
import type { CustomAction, TableConfig, TableField, TableRow } from "./types";
// resolveTableUiConfig 是个函数（不是类型），所以单独 import
import { resolveTableUiConfig } from "./types";
import { runFieldRules } from "./validators";
import {
  buildEmptyForm,
  buildQueryParams,
  clampPageSize,
  defaultSearchValues,
  formatCellValue,
  optionLabelOf,
  resolveActionSlotName,
} from "./utils";

defineOptions({ name: "Table" });

const props = withDefaults(
  defineProps<{
    /** 表格配置编号，必填 */
    tcid: string;
    /** 每页条数，不传则用配置里的默认值 */
    pageSize?: number;
    /** 是否显示搜索栏 */
    showSearch?: boolean;
    /** 表格高度，长表格建议传，比如 "520px" */
    height?: string;
    /** 表格最小高度（数据少/空表时不让表格塌下去），默认 320px；传了 height 时不生效 */
    minHeight?: string;
  }>(),
  { pageSize: 0, showSearch: true, height: "", minHeight: "320px" },
);

const emit = defineEmits<{
  /** 点了自定义按钮（页面没接管插槽时会触发这个事件） */
  (e: "action", payload: { value: string; row: TableRow; action: CustomAction }): void;
  /** 数据加载完成 */
  (e: "loaded", payload: { total: number }): void;
}>();

// ---------------- 状态 ----------------
const auth = useAuthStore();
const configLoading = ref(false);
const loading = ref(false);
const config = ref<TableConfig | null>(null);
const loadError = ref("");
const rows = ref<TableRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const searchValues = reactive<Record<string, any>>({});
const dictOptions = reactive<Record<string, Array<{ label: string; value: string }>>>({});

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref("");
const submitting = ref(false);
const formModel = reactive<Record<string, any>>({});

const detailVisible = ref(false);
const detailRow = ref<TableRow | null>(null);

// ---------------- 派生数据 ----------------
/** 列表列：按 listSort 排（老字段 sort 兜底） */
const columns = computed(() =>
  [...(config.value?.columns || [])].sort((a, b) => (a.listSort ?? a.sort ?? 0) - (b.listSort ?? b.sort ?? 0)),
);
/** 搜索项：按 searchSort 排（需求 002 第 5 条） */
const searchFields = computed(() =>
  [...(config.value?.searchFields || [])].sort((a, b) => (a.searchSort ?? 0) - (b.searchSort ?? 0)),
);
/** 表单项：可编辑 + 表单里显示，按 formSort 排 */
const formFields = computed(() =>
  (config.value?.fields || [])
    .filter((field) => field.editable !== false && field.formVisible !== false)
    .sort((a, b) => (a.formSort ?? a.listSort ?? 0) - (b.formSort ?? b.listSort ?? 0)),
);

/**
 * 详情字段：表单里配置为显示的字段，按 formSort 排。
 * 不要求 editable（只读字段也应该能在详情里看到），但顺序和占宽与表单一致。
 */
const detailFields = computed(() =>
  [...(config.value?.fields || [])]
    .filter((field) => field.formVisible !== false)
    .sort((a, b) => (a.formSort ?? a.listSort ?? 0) - (b.formSort ?? b.listSort ?? 0)),
);

const operations = computed(
  () => config.value?.operations || { look: false, create: false, update: false, delete: false },
);
const customActions = computed(() => config.value?.customActions || []);

/**
 * 这一行能不能改/删（只影响按钮显示，后端还会再校验一次）。
 *
 * 生效后的 writeScope 已经由后端折算过：超管 / 写范围为 ALL 时是 "ALL"，
 * 只有真正限制「仅本人」时才会走到 created_by 比对。
 * 历史数据没有 created_by（null），非超管用户看不到也改不了。
 */
function canWriteRow(row: TableRow): boolean {
  if (config.value?.writeScope !== "OWN") return true;
  const currentUserId = auth.user?.id;
  if (!currentUserId) return false;
  return row.created_by === currentUserId;
}

/**
 * 界面配置（表格高度、表单弹框长宽）。
 * 后台配了就用后台的，没配过（config 为 null）就用组件内置默认值，
 * 所以组件里读它时永远有值，不用再判空。
 */
const uiConfig = computed(() => resolveTableUiConfig(config.value?.config));

/**
 * 表格高度。
 * 优先级：prop（页面里手写 <Table height="520px" />）> 后台界面配置 > 不设。
 * 返回 undefined 表示不设固定高度，此时模板里用 min-height 兜底（空表也不会塌成一条）。
 */
const tableHeight = computed<string | undefined>(() => {
  if (props.height) return props.height;
  return `${uiConfig.value.table.height}px`;
});

/** 新增 / 编辑弹框宽度 */
const dialogWidth = computed(() => `${uiConfig.value.form.dialog.width}px`);

/**
 * 弹框高度（写成内联样式）。
 *
 * 这里用 CSS 的 min() 让「后台配的高度」和「屏幕放得下的高度」取小值：
 *   配了 960px、但屏幕只有 800px 高时，实际就是 800 - 40 = 760px，不会顶出屏幕。
 * 40px 是上下各 20px 的留白，和下面样式里弹框的 margin: 20px auto 对应。
 */
const dialogStyle = computed(() => ({
  height: `min(${uiConfig.value.form.dialog.height}px, calc(100vh - 40px))`,
}));

/** 操作列宽度：按实际会显示几个按钮动态算，避免按钮换行 */
const operationColumnWidth = computed(() => {
  let width = 24;
  if (operations.value.look) width += 48;
  if (operations.value.update) width += 56;
  if (operations.value.delete) width += 56;
  width += customActions.value.length * 76;
  return Math.max(120, width);
});

/**
 * 搜索项用什么控件渲染。
 * 规则：有选项（字典/静态）优先下拉；布尔用是/否；区间用范围；其余按类型。
 */
function searchControl(field: TableField): string {
  const hasOptions = Boolean(field.options?.dict || (field.options?.static && field.options.static.length > 0));
  if (hasOptions) return field.searchOp === "in" || field.searchOp === "notIn" ? "multi-select" : "select";
  if (field.type === "boolean") return "select";
  if (field.searchOp === "between") {
    return field.type === "date" || field.type === "datetime" ? "date-range" : "number-range";
  }
  if (field.type === "number" || field.type === "integer") return "number";
  if (field.type === "date" || field.type === "datetime") return "date";
  return "input";
}

/** 下拉选项：静态选项优先，其次用字典接口拿到的选项 */
function optionsFor(field: TableField): Array<{ label: string; value: any }> {
  if (field.options?.static?.length) return field.options.static;
  const dictCode = field.options?.dict;
  if (dictCode && dictOptions[dictCode]) return dictOptions[dictCode];
  if (field.type === "boolean") {
    return [
      { label: "是", value: true },
      { label: "否", value: false },
    ];
  }
  return [];
}

/**
 * 单元格最终显示的文字。
 *
 * 配了业务字典 / 静态选项的字段，先把机器值换成 label（如 paid → 已付款），
 * 跟表单下拉框里看到的文案保持一致；字典里查不到的历史值、或没配选项的字段，
 * 退回 formatCellValue 的默认格式化（日期截断、布尔转是/否等）。
 */
function cellText(row: TableRow, column: TableField): string {
  const raw = row[column.name];
  return optionLabelOf(raw, optionsFor(column)) ?? formatCellValue(raw, column.type);
}

// ---------------- 数据加载 ----------------
async function loadConfig(): Promise<void> {
  configLoading.value = true;
  loadError.value = "";
  try {
    const data = await tableDataApi.config(props.tcid);
    config.value = data;
    pageSize.value = clampPageSize(props.pageSize || data.pageSize || 20);

    // 重置搜索表单的值
    Object.keys(searchValues).forEach((key) => delete searchValues[key]);
    Object.assign(searchValues, defaultSearchValues(data.searchFields || []));

    await loadDictOptions();
  } catch (error: any) {
    loadError.value = error?.message || `无法加载 TCID「${props.tcid}」的配置`;
    config.value = null;
  } finally {
    configLoading.value = false;
  }
}

/** 预加载所有字典字段的选项，渲染下拉框用 */
async function loadDictOptions(): Promise<void> {
  const codes = new Set<string>();
  for (const field of config.value?.fields || []) {
    if (field.options?.dict) codes.add(field.options.dict);
  }
  for (const code of codes) {
    if (dictOptions[code]) continue;
    try {
      const result = await dictApi.itemsByCode(code);
      dictOptions[code] = result.items || [];
    } catch {
      dictOptions[code] = [];
    }
  }
}

async function loadData(): Promise<void> {
  if (!config.value) return;
  loading.value = true;
  try {
    const params = buildQueryParams({
      page: page.value,
      pageSize: pageSize.value,
      searchValues,
      fields: searchFields.value,
      mode: config.value.searchMode || "AND",
    });
    const result = await tableDataApi.list(props.tcid, params);
    rows.value = result.list || [];
    total.value = result.total || 0;
    emit("loaded", { total: total.value });
  } catch (error) {
    rows.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/** 对外暴露：父组件可以 <Table ref="tableRef" /> 然后 tableRef.value.reload() */
async function reload(): Promise<void> {
  await loadConfig();
  await loadData();
}

// ---------------- 搜索 ----------------
function handleSearch(): void {
  page.value = 1;
  loadData();
}

function handleReset(): void {
  Object.keys(searchValues).forEach((key) => delete searchValues[key]);
  Object.assign(searchValues, defaultSearchValues(searchFields.value));
  page.value = 1;
  loadData();
}

function handleSizeChange(size: number): void {
  pageSize.value = size;
  page.value = 1;
  loadData();
}

function handlePageChange(current: number): void {
  page.value = current;
  loadData();
}

// ---------------- 新增 / 编辑 ----------------
function fillForm(source?: TableRow): void {
  const model = buildEmptyForm(formFields.value);
  Object.keys(formModel).forEach((key) => delete formModel[key]);
  Object.assign(formModel, model);

  if (source) {
    for (const field of formFields.value) {
      const value = source[field.name];
      // 日期类字段要截成控件能识别的格式
      if (field.type === "date" && value) formModel[field.name] = String(value).slice(0, 10);
      else if (field.type === "datetime" && value) formModel[field.name] = String(value).replace("T", " ").slice(0, 19);
      else formModel[field.name] = value ?? model[field.name];
    }
  }
}

function openCreate(): void {
  dialogMode.value = "create";
  editingId.value = "";
  fillForm();
  dialogVisible.value = true;
}

function openEdit(row: TableRow): void {
  dialogMode.value = "edit";
  editingId.value = row.id;
  fillForm(row);
  dialogVisible.value = true;
}

// ---------------- 查看详情 ----------------
/**
 * 打开详情弹框。
 *
 * 数据直接用当前行（列表接口已经按字段白名单返回），只读展示，
 * 所以不需要再请求一次详情接口，也不存在「打开后数据又被别人改了」的问题。
 */
function openDetail(row: TableRow): void {
  detailRow.value = row;
  detailVisible.value = true;
}

/**
 * 详情里某个字段显示的文字。
 *
 * 和列表单元格走同一套规则（字典 label 优先、日期截断、布尔转是/否），
 * 保证「列表里看到的」和「详情里看到的」一致；
 * JSON 字段额外做一次格式化，否则一行挤在一起没法看。
 */
function detailValue(field: TableField): string {
  const row = detailRow.value;
  if (!row) return "—";

  const raw = row[field.name];
  if (raw === null || raw === undefined || raw === "") return "—";

  if (field.type === "json") {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return JSON.stringify(parsed, null, 2);
    } catch {
      // 库里存了不合法 JSON 时按原文显示，至少不吞数据
      return String(raw);
    }
  }

  return cellText(row, field);
}

async function submitForm(): Promise<void> {
  // 表单校验（需求 002 第 5 条）：
  //   1. 必填   2. 正则   3. 自定义校验器（能拿到整个表单，做联动）
  // 后端还会再校验一次，前端这层是为了体验。
  for (const field of formFields.value) {
    const value = formModel[field.name];
    const isEmpty = value === "" || value === null || value === undefined;

    if (field.required && isEmpty) {
      ElMessage.warning(`请填写「${field.label}」`);
      return;
    }

    const ruleError = runFieldRules(field, value, formModel);
    if (ruleError) {
      ElMessage.warning(ruleError);
      return;
    }
  }

  submitting.value = true;
  try {
    if (dialogMode.value === "create") {
      await tableDataApi.create(props.tcid, { ...formModel });
      ElMessage.success("新增成功");
    } else {
      await tableDataApi.update(props.tcid, editingId.value, { ...formModel });
      ElMessage.success("修改成功");
    }
    dialogVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: TableRow): Promise<void> {
  try {
    await ElMessageBox.confirm("删除后不可恢复，确定要删除这条数据吗？", "删除确认", {
      type: "warning",
      confirmButtonText: "确定删除",
      cancelButtonText: "取消",
    });
  } catch {
    return; // 用户点了取消
  }

  await tableDataApi.remove(props.tcid, row.id);
  ElMessage.success("已删除");

  // 删掉当前页最后一条时，退回上一页，避免停在空白页
  if (rows.value.length === 1 && page.value > 1) page.value -= 1;
  await loadData();
}

// ---------------- 自定义按钮 ----------------
async function handleCustomAction(action: CustomAction, row: TableRow): Promise<void> {
  if (action.confirm) {
    try {
      await ElMessageBox.confirm(`确定要执行「${action.label}」吗？`, "操作确认", { type: "warning" });
    } catch {
      return;
    }
  }

  // 页面没写对应插槽时，退化成事件通知；页面也没监听就提示一下，避免「点了没反应」
  emit("action", { value: action.value, row, action });
}

// ---------------- 生命周期 ----------------
onMounted(async () => {
  await loadConfig();
  await loadData();
});

// 同一个页面里切换 TCID（比如通过路由参数）时自动重新加载
watch(
  () => props.tcid,
  async () => {
    page.value = 1;
    await reload();
  },
);

defineExpose({
  reload,
  getConfig: () => config.value,
  getRows: () => rows.value,
});
</script>

<style lang="less" scoped>
@import "../../styles/variables.less";

.bmf-table {
  background: @bg-white;
  border-radius: @radius;
  padding: 16px;
}

/* 表格最小高度：由组件根节点的 CSS 变量控制（默认 320px，可用 minHeight 覆盖）。
   el-table 本身只有 height / max-height，没有 min-height，所以这里用样式兜住。
   空表时让「暂无数据」在最小高度区域里垂直居中，否则会贴在表头下面。 */
.bmf-table :deep(.el-table) {
  min-height: var(--bmf-table-min-height, 320px);
}

.bmf-table :deep(.el-table__empty-block) {
  min-height: calc(var(--bmf-table-min-height, 320px) - 48px);
}

/* 新增/编辑弹框：配了固定高度以后，让中间的输入区自己滚动，标题和底部按钮始终可见。
   el-dialog 默认是「内容多高就多高」，只设 height 会让内容溢出去盖住边框。
   这里把它排成竖着的 flex，再让 body 占满剩余高度并在超出时滚动。 */
.bmf-table :deep(.bmf-form-dialog) {
  display: flex;
  flex-direction: column;
  /* Element Plus 默认上边距是 15vh，配了固定高度后会顶出屏幕，这里压成 20px */
  margin: 20px auto;
  /* 裁掉溢出的圆角部分，视觉上更干净 */
  overflow: hidden;
}

.bmf-table :deep(.bmf-form-dialog .el-dialog__body) {
  /* flex: 1 表示「把除去标题和底部按钮之外的高度都占了」 */
  flex: 1;
  /* 只纵向滚动，横向一律裁掉。
     为什么不能直接用 overflow: auto：表单用的是 <el-row :gutter="12">，
     Element Plus 会给 row 加左右各 -6px 的外边距（靠 col 的 padding 补回来），
     于是 row 比容器宽 12px —— 内容明明放得下，也会多出一条没用的横向滚动条。 */
  overflow-x: hidden;
  overflow-y: auto;
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
  color: @text-secondary;
}

/* ---------------- 查看详情 ---------------- */
/* 24 栅格和表单保持一致：字段配的「所占列」（formSpan）直接映射成网格跨度。
   容器只画左边和上边的框线，每个单元格画右边和下边，拼起来就是一张完整的表格；
   这样跨列的字段也能自然占满，不会因为 gap 断线。 */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  border-top: 1px solid @border-light;
  border-left: 1px solid @border-light;
  border-radius: @radius-sm;
  overflow: hidden;
}

/* 一个字段 = 表格里的一格：左边是标签（浅底、右对齐），右边是值 */
.detail-cell {
  display: flex;
  min-width: 0;
  border-right: 1px solid @border-light;
  border-bottom: 1px solid @border-light;
}

.detail-label {
  flex: 0 0 120px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 2px;
  padding: 10px 12px;
  background: @bg-page;
  color: @text-regular;
  font-weight: 500;
  /* 标签很长时允许折行，不再撑宽整列 */
  overflow-wrap: anywhere;
}

.detail-required {
  color: @danger;
  line-height: 1.4;
}

.detail-value {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  color: @text-main;
  /* 多行文本 / JSON 保留换行；长串（URL、JSON）强制在任意位置断行，避免撑出横向滚动条 */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
