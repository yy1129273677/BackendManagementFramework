<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="16">
        <div class="page-card">
          <h3 style="margin-top: 0">欢迎，{{ auth.user?.nickname || auth.user?.username }}</h3>
          <p class="text-muted">
            当前系统：{{ auth.user?.systemName }}
            <template v-if="auth.activeSystemCode">（正在配置：{{ auth.activeSystemCode }}）</template>
            <template v-if="auth.isSuper">｜超级管理员</template>
          </p>

          <el-divider />

          <h4>四步搭出一个业务后台</h4>
          <div v-for="(step, index) in steps" :key="index" class="step">
            <div class="step-title">
              {{ step.title }}
              <el-button v-if="step.action" link type="primary" size="small" @click="router.push(`/${step.action}`)">
                去操作
              </el-button>
            </div>
            <div class="text-muted">{{ step.desc }}</div>
          </div>

          <el-divider />

          <h4>前端写自定义页面的方式</h4>
          <p class="text-muted">
            <code>&lt;Table :tcid="'你的TCID'" /&gt;</code> 一行渲染整张表； 自定义按钮用
            <code>#action-&lt;value&gt;</code>，自定义单元格用 <code>#col-&lt;字段名&gt;</code>。 示例见
            <code>client/src/views/examples/demo-table.vue</code>。
          </p>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="page-card">
          <h4 style="margin-top: 0">运行状态</h4>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="后端">
              <el-tag :type="health?.status === 'ok' ? 'success' : 'danger'" size="small">
                {{ health?.status || "连接中" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="数据库">
              <el-tag :type="health?.db ? 'success' : 'danger'" size="small">
                {{ health?.db ? "已连接" : "不可用" }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="pgvector">
              <el-tag :type="health?.pgvector ? 'success' : 'warning'" size="small">
                {{ health?.pgvector ? "已安装（预留语义检索）" : "未安装" }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <h4>常用入口</h4>
          <el-space direction="vertical" alignment="start">
            <el-button size="small" @click="router.push('/table-config')">表格配置</el-button>
            <el-button size="small" @click="router.push('/route')">路由管理</el-button>
            <el-button size="small" @click="router.push('/dict')">业务字典</el-button>
            <el-button size="small" @click="router.push('/user')">用户管理</el-button>
          </el-space>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
/**
 * 首页：把「这套框架怎么用」用最短路径说清楚。
 * 新接手的人打开系统第一眼就能知道下一步该点哪里。
 */
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { healthApi } from "@/api";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();
const health = ref<any>(null);

onMounted(async () => {
  try {
    health.value = await healthApi.check();
  } catch {
    health.value = { status: "down" };
  }
});

const steps = [
  {
    title: "① 建子系统",
    desc: "在「子系统管理」里新建一个子系统，拿到系统编码（比如 demo）。",
    action: "system",
  },
  {
    title: "② 切过去配",
    desc: "顶栏把「主系统」切成刚建的子系统，之后的配置都会落到它身上。",
    action: "",
  },
  {
    title: "③ 配一张表格",
    desc: "在「表格配置」里定义字段、搜索项、按钮，保存后拿到 TCID。",
    action: "table-config",
  },
  {
    title: "④ 加一条路由",
    desc: "在「路由管理」里加 TABLE 类型路由并绑定 TCID，菜单立刻就出现了。",
    action: "route",
  },
];
</script>

<style scoped>
.step {
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}

.step-title {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

code {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
