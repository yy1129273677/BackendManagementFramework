<template>
  <div class="tags-view">
    <el-scrollbar class="tags-scroll">
      <div class="tags-wrap">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.path"
          class="tab-item"
          :class="{ 'is-active': tab.path === route.path }"
          @click="activate(tab.path)"
        >
          <el-icon v-if="!tab.closable" class="tab-icon"><HomeFilled /></el-icon>
          <span class="tab-title">{{ tab.title }}</span>
          <el-icon v-if="tab.closable" class="tab-close" @click.stop="close(tab.path)"><Close /></el-icon>
        </div>

        <!-- 页签操作：紧跟在最后一个页签后面，不再孤零零甩到最右上角 -->
        <el-dropdown trigger="click" class="tab-more" @command="handleCommand">
          <span class="more-btn" title="页签操作">
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="others">关闭其它</el-dropdown-item>
              <el-dropdown-item command="all">关闭全部</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
/**
 * 内容区顶部的页签导航（浏览器 tab 风格）。
 *
 * 需求 002 第 4 条：顶部要有可切换的 tag 标签，点一下切页面，× 关掉。
 *
 * 本次视觉调整：
 *   - 页签条 40px、浅灰底，和下面的白色工具条拉开层次
 *   - 页签做成「贴着内容区的浏览器 tab」：选中项白底 + 顶部 2px 主色条，
 *     底边和下面的工具条连成一片；未选中透明底
 *   - 页签操作下拉跟到最后一个页签后面，不再飘在最右上角
 *
 * 实现要点：
 *   - 页签数据存在 stores/tabs.ts，跟路由联动：每次路由变化自动记录
 *   - 首页固定不可关，避免关光了没落脚点
 *   - 关掉当前页签时自动跳到右边（没有就跳左边）
 */
import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTabsStore } from "@/stores/tabs";

const route = useRoute();
const router = useRouter();
const tabsStore = useTabsStore();

/** 把当前路由记录成一个页签 */
function syncTab(): void {
  if (route.meta?.public) return;
  tabsStore.open(route.path, String(route.meta?.title || route.path));
}

function activate(path: string): void {
  if (path !== route.path) router.push(path);
}

function close(path: string): void {
  const next = tabsStore.close(path);
  if (next) router.push(next);
}

function closeOthers(): void {
  tabsStore.closeOthers(route.path);
}

function closeAll(): void {
  const next = tabsStore.closeAll();
  router.push(next);
}

function handleCommand(command: string): void {
  if (command === "others") closeOthers();
  else closeAll();
}

onMounted(syncTab);
// fullPath 变化才同步，避免 query 变化时重复 push
watch(
  () => route.fullPath,
  () => syncTab(),
);
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

/* 页签条：浅灰底 + 40px，和下面 48px 的白色工具条形成层次。
   不加底边线：选中页签是白底，靠「灰色条 vs 白色工具条」的色差分层，
   这样选中 tab 和下面工具条无缝衔接，不会有一条 1px 灰缝。 */
.tags-view {
  height: 40px;
  padding: 0 12px 0 16px;
  background: @bg-page;
  display: flex;
  align-items: flex-end;
}

.tags-scroll {
  flex: 1;
  min-width: 0;
}

.tags-wrap {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 40px;
  white-space: nowrap;
}

/* 浏览器 tab 风格：圆角在顶部，选中项白底 + 主色条，底边与下方白色工具条连成一片 */
.tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: @radius @radius 0 0;
  color: @text-secondary;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.16s,
    color 0.16s,
    border-color 0.16s;

  &:hover {
    color: @text-main;
    background: fade(@bg-white, 65%);
  }

  &.is-active {
    background: @bg-white;
    border-color: @border-light;
    border-bottom-color: transparent;
    color: @primary;
    font-weight: 600;

    /* 顶部主色条：选中页签的标志 */
    &::before {
      content: "";
      position: absolute;
      top: 0;
      left: 6px;
      right: 6px;
      height: 2px;
      background: @primary;
      border-radius: 0 0 2px 2px;
    }

    .tab-close {
      color: fade(@primary, 75%);

      &:hover {
        color: @danger;
      }
    }
  }
}

.tab-icon {
  font-size: 14px;
}

.tab-title {
  line-height: 1;
}

.tab-close {
  font-size: 13px;
  color: @text-placeholder;
  transition: color 0.16s;

  &:hover {
    color: @danger;
  }
}

/* 页签操作按钮：跟在最后一个页签后面 */
.tab-more {
  display: inline-flex;
  align-items: center;
  margin: 0 0 5px 2px;
}

.more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: @radius-sm;
  color: @text-secondary;
  cursor: pointer;
  transition:
    background 0.16s,
    color 0.16s;

  &:hover {
    background: @bg-white;
    color: @primary;
  }
}
</style>
