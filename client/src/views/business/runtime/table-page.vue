<template>
  <div>
    <el-alert
      v-if="!tcid"
      type="warning"
      show-icon
      :closable="false"
      title="这条路由没有绑定 TCID"
      description="请到「路由管理」里把路由类型设为 TABLE 并选择一个表格配置（TCID）。"
    />
    <Table v-else :tcid="tcid" />
  </div>
</template>

<script setup lang="ts">
/**
 * 表格路由的容器页。
 *
 * 路由管理里配置成 TABLE 类型时，前端就把这个页面挂到那个路径上，
 * 页面只做一件事：把 TCID 交给公用组件 <Table>。
 *
 * 两种来源：
 *   1. 动态路由的 meta.tcid（后台配的路由）
 *   2. 路由参数 :tcid（预览页 /preview/:tcid）
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import Table from "@/components/table/index.vue";

const route = useRoute();

const tcid = computed(() => String(route.meta?.tcid || route.params?.tcid || ""));
</script>
