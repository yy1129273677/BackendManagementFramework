<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h2>后台管理框架</h2>
        <p class="text-muted">主系统负责配置，子系统负责使用</p>
      </div>

      <el-form :model="form" label-position="top" @submit.prevent="handleEnter">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" size="large" autofocus />
        </el-form-item>

        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item label="系统编码（可留空）">
          <el-input
            v-model="form.systemCode"
            placeholder="留空 = 登录主系统；填 demo = 登录演示子系统"
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleLogin">
          登录
        </el-button>
      </el-form>

      <div class="login-tips">
        <p>默认账号（首次执行 <code>npm run seed</code> 后可用）：</p>
        <p>超管：<code>yy1 / yy1129273677</code>，系统编码留空</p>
        <p>演示：<code>demo / demo123456</code>，系统编码填 <code>demo</code></p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 登录页。
 *
 * 三个输入框：
 *   用户名 / 密码 / 系统编码（可选）
 *
 * 系统编码怎么用：
 *   - 留空 → 登录主系统（超管 yy1）
 *   - 填 demo → 登录 demo 子系统里的普通用户
 *   这样同一个登录页既能给超管用，也能给客户用。
 */
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "@/stores/auth";
import { useMenuStore } from "@/stores/menu";
import { resetDynamicRouteFlag } from "@/router";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const menuStore = useMenuStore();

const loading = ref(false);

const form = reactive({
  username: "",
  password: "",
  systemCode: "",
});

async function handleLogin(): Promise<void> {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }

  loading.value = true;
  try {
    await auth.login({
      username: form.username.trim(),
      password: form.password,
      systemCode: form.systemCode.trim() || undefined,
    });

    // 登录后要重新加载菜单和动态路由
    menuStore.reset();
    resetDynamicRouteFlag();

    ElMessage.success("登录成功");
    const redirect = String(route.query.redirect || "/dashboard");
    await router.replace(redirect);
  } catch {
    // 错误提示已经由 axios 拦截器统一弹过，这里不用重复弹
  } finally {
    loading.value = false;
  }
}

/** 回车直接提交，登录页不用点按钮 */
function handleEnter(): void {
  handleLogin();
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2d3d 0%, #2d4a63 100%);
}

.login-card {
  width: 400px;
  padding: 32px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.login-header {
  text-align: center;
  margin-bottom: 20px;
}

.login-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.login-tips {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed #e4e7ed;
  font-size: 12px;
  color: #909399;
  line-height: 1.9;
}

.login-tips code {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
  color: #606266;
}
</style>
