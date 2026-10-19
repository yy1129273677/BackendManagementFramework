<template>
  <div ref="container" class="echart" :style="{ height }"></div>
</template>

<script setup lang="ts">
/**
 * ECharts 通用封装。
 *
 * 干什么：
 *   给页面一个 `<EChart :option="xxx" />` 就能画图，不用每个页面都写 init / setOption / resize / dispose。
 *
 * 参数：
 *   option - ECharts 配置对象（和官方文档里的 option 完全一样）
 *   height - 图表高度，默认 320px
 *
 * 注意：
 *   - 只按下需要用的图表类型和组件（按需引入），避免把整个 echarts 打进包里
 *   - 容器尺寸变化（比如侧边栏收起、窗口缩放）会自动 resize，靠 ResizeObserver
 *   - 组件卸载时销毁实例，防止内存泄漏（反复切页面不销毁会有多个 canvas 残留）
 *   - option 是深度监听的：页面重新请求数据后只要换 option 就会重绘
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// 按需注册：用到什么注册什么，没注册的类型 setOption 会静默不显示
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const props = withDefaults(
  defineProps<{
    /** ECharts 配置对象 */
    option: Record<string, any>;
    /** 图表高度，如 "320px" / "40vh" */
    height?: string;
  }>(),
  { height: "320px" },
);

const container = ref<HTMLDivElement>();
/** echarts 实例，没挂载前是 null（类型用 init 的返回值推，避免依赖 echarts 的类型导出路径） */
let chart: ReturnType<typeof echarts.init> | null = null;
/** 监听容器尺寸变化的观察器 */
let observer: ResizeObserver | null = null;

/** 用最新 option 重绘（每次整体替换，避免旧数据残留） */
function render(): void {
  if (!chart) return;
  chart.setOption(props.option, true);
}

onMounted(() => {
  if (!container.value) return;
  chart = echarts.init(container.value);
  render();

  // 容器大小变化时让图表跟着缩放；不支持 ResizeObserver 的环境（很老的浏览器）就跳过
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(container.value);
  }
});

// 数据变了就重绘。deep 是因为 option 通常是 computed 出来的新对象，但内部数组会被替换
watch(() => props.option, render, { deep: true });

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});
</script>

<style lang="less" scoped>
.echart {
  width: 100%;
}
</style>
