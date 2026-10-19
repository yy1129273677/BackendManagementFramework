<template>
  <el-container class="layout">
    <!-- 左侧菜单 -->
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span class="logo-title">后台管理框架</span>
        <span class="logo-sub">{{ currentSystemLabel }}</span>
      </div>

      <el-scrollbar>
        <el-menu :default-active="activeMenu" router class="menu">
          <!-- 主系统管理菜单 -->
          <el-menu-item v-for="item in staticMenus" :key="item.path" :index="item.path">
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.title }}</span>
          </el-menu-item>

          <!-- 子系统业务菜单（数据库里配的） -->
          <template v-if="dynamicMenus.length > 0">
            <div class="menu-group-title">业务菜单</div>
            <el-menu-item v-for="item in dynamicMenus" :key="item.path" :index="item.path">
              <el-icon>
                <component :is="item.icon || 'Menu'" />
              </el-icon>
              <span>{{ item.title }}</span>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-left">
          <span class="page-title">{{ route.meta.title || "" }}</span>
          <el-tag v-if="route.meta.type === 'TABLE'" size="small" type="success"> TCID：{{ route.meta.tcid }} </el-tag>
        </div>

        <div class="header-right">
          <!-- 超管专用：切换要配置的子系统 -->
          <el-select
            v-if="auth.isSuper"
            :model-value="auth.activeSystemCode"
            placeholder="主系统（不切换）"
            clearable
            size="small"
            style="width: 180px"
            @change="handleSwitchSystem"
          >
            <el-option label="主系统（不切换）" value="" />
            <el-option
              v-for="item in systems.filter((s) => !s.isMain)"
              :key="item.code"
              :label="item.name"
              :value="item.code"
            />
          </el-select>

          <el-tag v-if="auth.isSuper" type="danger" size="small">超管</el-tag>

          <el-dropdown @command="(command: string) => command === 'logout' && handleLogout()">
            <span class="user-info">
              {{ auth.user?.nickname || auth.user?.username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ auth.user?.username }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
/**
 * 后台整体布局：左侧菜单 + 顶栏 + 内容区。
 *
 * 菜单来源有两份：
 *   1. 静态菜单（主系统的管理页面），按当前用户权限过滤
 *   2. 动态菜单（子系统里配置的业务路由）
 *
 * 顶栏的「子系统切换」只有超管能看：
 *   超管登录在主系统，可以切到某个子系统去给它配路由/表格/用户，
 *   切换后所有请求都会自动带上 X-System-Code。
 */
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { systemApi } from "@/api";
import { useAuthStore } from "@/stores/auth";
import { useMenuStore } from "@/stores/menu";
import { resetDynamicRouteFlag, staticRoutes } from "@/router";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const menuStore = useMenuStore();

/** 子系统列表（只有超管才去拉） */
const systems = ref<Array<{ id: string; code: string; name: string; isMain: boolean }>>([]);

/** 静态菜单：从路由表里取有 title、没标 hidden 的子路由，再按权限过滤 */
const staticMenus = computed(() => {
  const rootRoute = staticRoutes.find((item) => item.name === "root");
  const children = (rootRoute?.children || []) as any[];
  return children
    .filter((item) => item.meta?.title && !item.meta?.hidden)
    .filter((item) => !item.meta?.permission || auth.hasPermission(item.meta.permission))
    .map((item) => ({
      path: `/${item.path}`,
      title: item.meta.title,
      icon: item.meta.icon || "Menu",
    }));
});

/** 子系统动态菜单 */
const dynamicMenus = computed(() => menuStore.sortedRoutes);

/** 当前选中的菜单（用于高亮） */
const activeMenu = computed(() => route.path);

/** 顶部显示：主系统还是某个子系统 */
const currentSystemLabel = computed(() => {
  if (auth.activeSystemCode) {
    const found = systems.value.find((item) => item.code === auth.activeSystemCode);
    return found ? `正在配置：${found.name}` : `正在配置：${auth.activeSystemCode}`;
  }
  return auth.user?.systemName || "主系统";
});

async function loadSystems(): Promise<void> {
  if (!auth.isSuper) return;
  try {
    const result = await systemApi.list();
    systems.value = result.list || [];
  } catch {
    systems.value = [];
  }
}

/**
 * 切换要配置的子系统。
 *
 * 实现方式：改本地记录的编码后整页刷新。
 * 为什么不走「热切换」：动态路由、菜单、查询缓存都要重来，
 * 整页刷新最短最稳，代价只是一次几百毫秒的加载。
 */
async function handleSwitchSystem(code: string): Promise<void> {
  auth.setActiveSystem(code);
  router.replace("/dashboard");
  window.location.reload();
}

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm("确定要退出登录吗？", "提示", {
      type: "warning",
    });
  } catch {
    return;
  }
  auth.logout();
  menuStore.reset();
  resetDynamicRouteFlag();
  ElMessage.success("已退出登录");
  router.replace("/login");
}

onMounted(loadSystems);
</script>

<style scoped>
.layout {
  height: 100vh;
}

.aside {
  background: #1f2d3d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-title {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.logo-sub {
  color: #8a9bb0;
  font-size: 12px;
  margin-top: 2px;
}

.menu {
  border-right: none;
  background: transparent;
}

.menu :deep(.el-menu-item) {
  color: #c0ccda;
}

.menu :deep(.el-menu-item.is-active) {
  color: #fff;
  background: #263445;
}

.menu :deep(.el-menu-item:hover) {
  background: #263445;
}

.menu-group-title {
  color: #6b7d92;
  font-size: 12px;
  padding: 12px 16px 4px;
}

.header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
}

.main {
  padding: 16px;
  overflow: auto;
}
</style>
