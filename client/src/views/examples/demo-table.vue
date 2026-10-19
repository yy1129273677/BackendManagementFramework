<template>
  <div>
    <div class="page-card" style="margin-bottom: 12px">
      <h3 style="margin-top: 0">自定义页面示例（CUSTOM 路由）</h3>
      <p class="text-muted" style="margin-bottom: 4px">
        这个页面是手写的 vue 文件，通过路由管理里的「前端文件路径」挂到菜单上。
      </p>
      <p class="text-muted" style="margin-bottom: 0">
        表格本身没有一行列定义代码，全部来自 TCID 配置；只用了两个按钮插槽和一个状态列插槽。
      </p>
    </div>

    <Table :tcid="DEMO_TCID">
      <!-- 接管配置里 value = 'ship' 的自定义按钮 -->
      <template #action-ship="{ row, reload }">
        <el-button link type="success" size="small" @click="handleShip({ row, reload })">标记发货</el-button>
      </template>

      <!-- 接管配置里 value = 'detail' 的自定义按钮 -->
      <template #action-detail="{ row }">
        <el-button link type="primary" size="small" @click="handleDetail(row)">查看详情</el-button>
      </template>

      <!-- 接管 status 列：插槽名是动态的 col-<字段名>，TS 推断不出作用域类型，所以用 row -->
      <template #col-status="{ row }">
        <el-tag :type="statusTagType(row.status)" size="small">
          {{ statusLabels[row.status] || row.status }}
        </el-tag>
      </template>
    </Table>
  </div>
</template>

<script setup lang="ts">
/**
 * 自定义页面 + 公用表格组件 的完整示例。
 *
 * 这个文件演示三件事：
 *   1. 引入公用组件 <Table>，只传一个 TCID 就把整张表渲染出来
 *   2. 用 #action-<value> 插槽接管配置里的自定义按钮（value 就是配置里填的标识）
 *   3. 用 #col-<字段名> 插槽接管某一列的渲染（比如把状态渲染成彩色标签）
 *
 * 你可以照着这个文件写自己的业务页面：
 *   复制一份 → 改 TCID → 删掉不需要的插槽 → 在路由管理里配一条 CUSTOM 路由指向它。
 */
import { onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import Table from "@/components/table/index.vue";
import { dictApi, tableDataApi } from "@/api";

/** 演示表格的 TCID（由 prisma/seed.ts 创建） */
const DEMO_TCID = "TDEMOORDERS";

/** 订单状态字典：value → label，用于把 stored 值渲染成中文 */
const statusLabels = ref<Record<string, string>>({});

onMounted(async () => {
  try {
    const result = await dictApi.itemsByCode("order_status");
    const map: Record<string, string> = {};
    for (const item of result.items || []) map[item.value] = item.label;
    statusLabels.value = map;
  } catch {
    // 字典拿不到不影响页面，退化成显示原始值
  }
});

/** 自定义按钮「标记发货」：直接把 status 改成 shipped */
async function handleShip(payload: { row: any; reload: () => void }): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认把订单「${payload.row.order_no}」标记为已发货？`, "操作确认", { type: "warning" });
  } catch {
    return;
  }

  await tableDataApi.update(DEMO_TCID, payload.row.id, { status: "shipped" });
  ElMessage.success("已标记发货");
  payload.reload();
}

/** 自定义按钮「查看详情」：这里用最简单的弹窗展示整行数据 */
function handleDetail(row: any): void {
  ElMessageBox.alert(
    Object.entries(row)
      .map(([key, value]) => `${key}：${value === null || value === "" ? "-" : value}`)
      .join("<br/>"),
    `订单详情（${row.order_no || row.id}）`,
    { dangerouslyUseHTMLString: true },
  );
}

/** 状态标签颜色：不同状态给不同颜色，一眼看出进度 */
function statusTagType(status: string): "success" | "warning" | "info" | "danger" {
  if (status === "paid" || status === "shipped") return "success";
  if (status === "pending") return "warning";
  if (status === "cancelled") return "danger";
  return "info";
}
</script>
