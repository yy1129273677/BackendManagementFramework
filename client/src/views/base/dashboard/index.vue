<template>
  <div v-loading="loading" class="dashboard">
    <!-- 统计卡片：主系统看平台资源，子系统看自己的资源 -->
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.label" :xs="12" :sm="8" :md="4">
        <div class="stat-card">
          <div class="stat-value">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- ---------- 主系统首页：平台总览图表 ---------- -->
    <template v-if="isMainView">
      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :md="14">
          <div class="page-card">
            <h3 class="chart-title">各子系统资源对比</h3>
            <EChart :option="mainBarOption" height="320px" />
          </div>
        </el-col>
        <el-col :xs="24" :md="10">
          <div class="page-card">
            <h3 class="chart-title">表格配置分布</h3>
            <EChart :option="mainPieOption" height="320px" />
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :md="14">
          <div class="page-card">
            <h3 class="chart-title">平台近 7 天新增用户</h3>
            <EChart :option="mainTrendOption" height="300px" />
          </div>
        </el-col>
        <el-col :xs="24" :md="10">
          <div class="page-card">
            <h3 class="chart-title">各子系统用户分布</h3>
            <EChart :option="mainUserPieOption" height="300px" />
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :xs="24" :md="10">
          <div class="page-card">
            <h3 class="chart-title">平台资源构成</h3>
            <EChart :option="mainResourcePieOption" height="280px" />
          </div>
        </el-col>
        <el-col :xs="24" :md="14">
          <div class="page-card">
            <h3 class="chart-title">各子系统资源总量排行</h3>
            <EChart :option="mainRankOption" height="280px" />
          </div>
        </el-col>
      </el-row>
    </template>

    <!-- ---------- 子系统首页：只显示图表统计（没有搭建步骤、没有连接状态） ---------- -->
    <template v-else>
      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :md="14">
          <div class="page-card">
            <h3 class="chart-title">各业务表数据量（Top 10）</h3>
            <EChart :option="tableBarOption" height="320px" />
          </div>
        </el-col>
        <el-col :xs="24" :md="10">
          <div class="page-card">
            <h3 class="chart-title">角色用户分布</h3>
            <EChart :option="rolePieOption" height="320px" />
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :md="10">
          <div class="page-card">
            <h3 class="chart-title">各表数据量占比</h3>
            <EChart :option="tableShareOption" height="300px" />
          </div>
        </el-col>
        <el-col :xs="24" :md="14">
          <div class="page-card">
            <h3 class="chart-title">近 7 天新增用户</h3>
            <EChart :option="trendOption" height="300px" />
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="24">
          <div class="page-card">
            <h3 class="chart-title">近 7 天新增业务数据</h3>
            <EChart :option="dataTrendOption" height="280px" />
          </div>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 首页仪表盘（ECharts 统计）。
 *
 * 两个视角，按「当前在哪个系统」自动切换：
 *   1. 主系统（超管且没切到子系统）→ 平台总览：子系统/用户/路由/表格配置 + 各子系统资源对比图 + 表格分布饼图
 *   2. 子系统 → 只看本系统：用户/角色/路由/表格/字典 + 数据量柱状图 + 角色用户饼图 + 近 7 天新增用户折线图
 *
 * 注意：
 *   - 子系统首页按要求不再显示「搭建步骤」和「连接状态」，只有统计图表
 *   - 超管切换子系统后（auth.activeSystemCode 变化）会自动重新拉数据
 */
import { computed, onMounted, ref, watch } from "vue";
import { statsApi } from "@/api";
import { useAuthStore } from "@/stores/auth";
import EChart from "@/components/charts/EChart.vue";

const auth = useAuthStore();

/** 是否主系统首页：超管 + 当前没切换到任何子系统 */
const isMainView = computed(() => auth.isSuper && !auth.activeSystemCode);

const loading = ref(false);
/** 主系统总览数据（overview 接口） */
const overview = ref<any>(null);
/** 子系统统计（system 接口） */
const system = ref<any>(null);

/** 主系统卡片（业务行数在表太多时后端会给估算值，这时标签加「估算」） */
const mainCards = computed(() => [
  { label: "子系统", value: overview.value?.systems?.total ?? 0 },
  { label: "用户", value: overview.value?.totals?.users ?? 0 },
  { label: "角色", value: overview.value?.totals?.roles ?? 0 },
  { label: "路由", value: overview.value?.totals?.routes ?? 0 },
  { label: "表格配置", value: overview.value?.totals?.tables ?? 0 },
  {
    label: overview.value?.totals?.bizRowsEstimated ? "业务数据行（估算）" : "业务数据行",
    value: overview.value?.totals?.bizRows ?? 0,
  },
]);

/** 子系统卡片：6 张刚好铺满 24 栅格（5 张会空出一格灰底） */
const systemCards = computed(() => {
  // 业务数据行 = 各业务表数据量相加（后端 tableRows 已按表统计好）
  const dataRows = (system.value?.tableRows || []).reduce((sum: number, item: any) => sum + (item.count || 0), 0);
  return [
    { label: "用户", value: system.value?.totals?.users ?? 0 },
    { label: "角色", value: system.value?.totals?.roles ?? 0 },
    { label: "路由", value: system.value?.totals?.routes ?? 0 },
    { label: "表格配置", value: system.value?.totals?.tables ?? 0 },
    { label: "业务字典", value: system.value?.totals?.dicts ?? 0 },
    { label: "业务数据行", value: dataRows },
  ];
});

const cards = computed(() => (isMainView.value ? mainCards.value : systemCards.value));

/** 统一的图表配色和字体 */
const PALETTE = ["#409eff", "#67c23a", "#e6a23c", "#f56c6c", "#909399", "#9b59b6", "#00bcd4", "#ff9800"];
const AXIS_STYLE = {
  axisLabel: { color: "#909399", fontSize: 12 },
  axisLine: { lineStyle: { color: "#e4e7ed" } },
  splitLine: { lineStyle: { color: "#f2f3f5" } },
};

/** 各子系统资源对比：分组柱状图（用户/路由/表格配置） */
const mainBarOption = computed(() => {
  const list: any[] = overview.value?.perSystem || [];
  return {
    color: PALETTE,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, textStyle: { color: "#606266" } },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: "category", data: list.map((item) => item.name), ...AXIS_STYLE },
    yAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    series: [
      { name: "用户", type: "bar", barMaxWidth: 26, data: list.map((item) => item.users) },
      { name: "路由", type: "bar", barMaxWidth: 26, data: list.map((item) => item.routes) },
      { name: "表格配置", type: "bar", barMaxWidth: 26, data: list.map((item) => item.tables) },
    ],
  };
});

/** 表格配置分布：饼图（每个子系统有多少张表） */
const mainPieOption = computed(() => {
  const list: any[] = overview.value?.perSystem || [];
  const data = list.map((item) => ({ name: item.name, value: item.tables })).filter((item) => item.value > 0);
  return {
    color: PALETTE,
    tooltip: { trigger: "item", formatter: "{b}：{c} 张（{d}%）" },
    legend: { bottom: 0, textStyle: { color: "#606266" } },
    series: [
      {
        name: "表格配置",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{c} 张" },
        data: data.length > 0 ? data : [{ name: "暂无数据", value: 1, itemStyle: { color: "#ebeef5" } }],
      },
    ],
  };
});

/** 各业务表数据量：横向柱状图（表名可能很长，横向更好读） */
const tableBarOption = computed(() => {
  const list: any[] = system.value?.tableRows || [];
  return {
    color: [PALETTE[0]],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: "{b}：{c} 行" },
    grid: { left: 10, right: 40, top: 16, bottom: 10, containLabel: true },
    xAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    yAxis: { type: "category", data: list.map((item) => item.name), ...AXIS_STYLE },
    series: [
      {
        name: "数据量",
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", color: "#606266" },
        data: list.map((item) => item.count),
      },
    ],
  };
});

/** 角色用户分布：环形饼图 */
const rolePieOption = computed(() => {
  const list: any[] = system.value?.roleUsers || [];
  const data = list.map((item) => ({ name: item.name, value: item.count }));
  return {
    color: PALETTE,
    tooltip: { trigger: "item", formatter: "{b}：{c} 人（{d}%）" },
    legend: { bottom: 0, textStyle: { color: "#606266" } },
    series: [
      {
        name: "用户数",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "44%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{c} 人" },
        data: data.length > 0 ? data : [{ name: "暂无数据", value: 1, itemStyle: { color: "#ebeef5" } }],
      },
    ],
  };
});

/** 近 7 天新增用户：折线图（带面积） */
const trendOption = computed(() => {
  const list: any[] = system.value?.userTrend || [];
  return {
    color: [PALETTE[1]],
    tooltip: { trigger: "axis", formatter: "{b}：{c} 人" },
    grid: { left: 40, right: 24, top: 30, bottom: 24 },
    xAxis: { type: "category", boundaryGap: false, data: list.map((item) => item.day), ...AXIS_STYLE },
    yAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    series: [
      {
        name: "新增用户",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: list.map((item) => item.count),
        areaStyle: { opacity: 0.15 },
      },
    ],
  };
});

/** 主系统：平台近 7 天新增用户折线图 */
const mainTrendOption = computed(() => {
  const list: any[] = overview.value?.userTrend || [];
  return {
    color: [PALETTE[1]],
    tooltip: { trigger: "axis", formatter: "{b}：{c} 人" },
    grid: { left: 40, right: 24, top: 30, bottom: 24 },
    xAxis: { type: "category", boundaryGap: false, data: list.map((item) => item.day), ...AXIS_STYLE },
    yAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    series: [
      {
        name: "新增用户",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: list.map((item) => item.count),
        areaStyle: { opacity: 0.15 },
      },
    ],
  };
});

/** 主系统：各子系统用户分布饼图 */
const mainUserPieOption = computed(() => {
  const list: any[] = overview.value?.perSystem || [];
  const data = list.map((item) => ({ name: item.name, value: item.users })).filter((item) => item.value > 0);
  return {
    color: PALETTE,
    tooltip: { trigger: "item", formatter: "{b}：{c} 人（{d}%）" },
    legend: { bottom: 0, textStyle: { color: "#606266" } },
    series: [
      {
        name: "用户数",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "44%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{c} 人" },
        data: data.length > 0 ? data : [{ name: "暂无数据", value: 1, itemStyle: { color: "#ebeef5" } }],
      },
    ],
  };
});

/** 主系统：平台资源构成饼图（各类资源数量） */
const mainResourcePieOption = computed(() => {
  const totals = overview.value?.totals || {};
  const data = [
    { name: "用户", value: totals.users ?? 0 },
    { name: "角色", value: totals.roles ?? 0 },
    { name: "路由", value: totals.routes ?? 0 },
    { name: "表格配置", value: totals.tables ?? 0 },
    { name: "业务字典", value: totals.dicts ?? 0 },
  ].filter((item) => item.value > 0);
  return {
    color: PALETTE,
    tooltip: { trigger: "item", formatter: "{b}：{c} 个（{d}%）" },
    legend: { bottom: 0, textStyle: { color: "#606266" } },
    series: [
      {
        name: "资源数量",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "44%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{c} 个" },
        data: data.length > 0 ? data : [{ name: "暂无数据", value: 1, itemStyle: { color: "#ebeef5" } }],
      },
    ],
  };
});

/** 主系统：各子系统资源总量排行（横向堆叠柱：用户+路由+表格配置） */
const mainRankOption = computed(() => {
  const list: any[] = [...(overview.value?.perSystem || [])].sort(
    (a, b) => b.users + b.routes + b.tables - (a.users + a.routes + a.tables),
  );
  return {
    color: PALETTE,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, textStyle: { color: "#606266" } },
    grid: { left: 10, right: 24, top: 36, bottom: 10, containLabel: true },
    xAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    yAxis: { type: "category", data: list.map((item) => item.name), ...AXIS_STYLE },
    series: [
      { name: "用户", type: "bar", stack: "total", barMaxWidth: 20, data: list.map((item) => item.users) },
      { name: "路由", type: "bar", stack: "total", barMaxWidth: 20, data: list.map((item) => item.routes) },
      { name: "表格配置", type: "bar", stack: "total", barMaxWidth: 20, data: list.map((item) => item.tables) },
    ],
  };
});

/** 子系统：各表数据量占比饼图（数据量都为 0 时显示占位） */
const tableShareOption = computed(() => {
  const list: any[] = system.value?.tableRows || [];
  const data = list.map((item) => ({ name: item.name, value: item.count })).filter((item) => item.value > 0);
  return {
    color: PALETTE,
    tooltip: { trigger: "item", formatter: "{b}：{c} 行（{d}%）" },
    legend: { bottom: 0, textStyle: { color: "#606266" } },
    series: [
      {
        name: "数据量",
        type: "pie",
        radius: ["42%", "66%"],
        center: ["50%", "44%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}\n{c} 行" },
        data: data.length > 0 ? data : [{ name: "暂无数据", value: 1, itemStyle: { color: "#ebeef5" } }],
      },
    ],
  };
});

/** 子系统：近 7 天新增业务数据折线图 */
const dataTrendOption = computed(() => {
  const list: any[] = system.value?.dataTrend || [];
  return {
    color: [PALETTE[4]],
    tooltip: { trigger: "axis", formatter: "{b}：{c} 行" },
    grid: { left: 40, right: 24, top: 30, bottom: 24 },
    xAxis: { type: "category", boundaryGap: false, data: list.map((item) => item.day), ...AXIS_STYLE },
    yAxis: { type: "value", minInterval: 1, ...AXIS_STYLE },
    series: [
      {
        name: "新增数据行",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: list.map((item) => item.count),
        areaStyle: { opacity: 0.15 },
      },
    ],
  };
});

/** 拉取当前视角需要的统计数据 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    if (isMainView.value) {
      overview.value = await statsApi.overview();
    } else {
      system.value = await statsApi.system();
    }
  } catch {
    // 请求失败时保持空状态（卡片显示 0），不弹一堆错误打断首页
    if (isMainView.value) overview.value = null;
    else system.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// 超管在顶栏切换子系统后，首页要跟着换视角
watch(() => auth.activeSystemCode, load);
</script>

<style lang="less" scoped>
@import "../../../styles/variables.less";

.dashboard {
  min-height: 200px;
}

.stat-card {
  background: @bg-white;
  border-radius: @radius;
  padding: 16px 18px;
  margin-bottom: 16px;
  box-shadow: @shadow-card;
  transition:
    transform 0.16s,
    box-shadow 0.16s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  color: @primary;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 4px;
  font-size: 13px;
  color: @text-secondary;
}

.chart-row {
  margin-bottom: 0;
}

.chart-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: @text-main;
}

.page-card {
  margin-bottom: 16px;
}
</style>
