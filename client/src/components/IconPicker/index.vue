<template>
  <div class="icon-picker">
    <el-popover
      v-model:visible="visible"
      placement="bottom-start"
      :width="560"
      trigger="click"
      popper-class="icon-picker-popper"
    >
      <template #reference>
        <el-input :model-value="modelValue" readonly :placeholder="placeholder" class="icon-picker-input">
          <template #prefix>
            <el-icon v-if="modelValue">
              <component :is="modelValue" />
            </el-icon>
            <el-icon v-else><Search /></el-icon>
          </template>
          <template #suffix>
            <el-icon v-if="modelValue" class="clear-icon" @click.stop="clear"><CircleClose /></el-icon>
          </template>
        </el-input>
      </template>

      <div class="picker-body">
        <el-input v-model="keyword" size="small" placeholder="搜索图标名，例如 List / Setting" clearable />

        <div class="icon-grid">
          <div
            v-for="name in filteredIcons"
            :key="name"
            class="icon-cell"
            :class="{ active: name === modelValue }"
            :title="name"
            @click="choose(name)"
          >
            <el-icon :size="18">
              <component :is="name" />
            </el-icon>
            <span class="icon-name">{{ name }}</span>
          </div>
          <el-empty v-if="filteredIcons.length === 0" description="没有匹配的图标" :image-size="60" />
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
/**
 * 图标选择器。
 *
 * 需求 002 第 1 条：
 *   原来路由管理的图标是「一行一个图标」的下拉/输入框，选起来很累。
 *   现在改成弹层里平铺展示所有 Element Plus 图标（一行多个，直接显示图形），
 *   支持按名字搜索，点一下就选中。
 *
 * 注意：
 *   - 图标名是字符串（存进 sys_route.icon），前端用 <component :is="name" /> 动态渲染，
 *     所以 main.ts 里必须把 Element Plus 图标全量注册成全局组件（已注册）。
 *   - 图标很多（290+），用滚动区域 + 搜索而不是分页，操作更顺手。
 */
import { computed, ref } from "vue";
import * as ElementPlusIcons from "@element-plus/icons-vue";

defineOptions({ name: "IconPicker" });

const props = withDefaults(
  defineProps<{
    /** 选中的图标名（v-model） */
    modelValue?: string;
    /** 占位文字 */
    placeholder?: string;
  }>(),
  { modelValue: "", placeholder: "点击选择图标" },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

/** 所有图标名（按字母排序，方便找） */
const allIcons = Object.keys(ElementPlusIcons).sort();

const visible = ref(false);
const keyword = ref("");

const filteredIcons = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return allIcons;
  return allIcons.filter((name) => name.toLowerCase().includes(text));
});

function choose(name: string): void {
  emit("update:modelValue", name);
  visible.value = false;
  keyword.value = "";
}

function clear(): void {
  emit("update:modelValue", "");
}

/** 模板里用 props.modelValue，这里声明一下避免 TS 报未使用 */
void props;

defineExpose({ open: () => (visible.value = true) });
</script>

<style lang="less" scoped>
.icon-picker {
  width: 100%;
}

.icon-picker-input :deep(.el-input__inner) {
  cursor: pointer;
}

.clear-icon {
  cursor: pointer;
  color: #909399;
}

.picker-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 一行 6 个图标：图形 + 名字，扫一眼就能选 */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.icon-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 2px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  /* 栅格项默认最小宽度是内容宽度，长图标名（nowrap）会把整行撑宽、触发横向滚动条 */
  min-width: 0;
}

.icon-cell:hover {
  background: #f5f7fa;
  border-color: #dcdfe6;
}

.icon-cell.active {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.icon-name {
  font-size: 10px;
  color: #909399;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
