import { defineStore } from "pinia";
import { authApi } from "@/api";
import { SYSTEM_CODE_KEY, TOKEN_KEY, USER_KEY } from "@/api/request";

/**
 * 登录状态。
 *
 * 存了什么：
 *   - token：刷新页面后从 localStorage 恢复
 *   - user：当前用户信息（含权限码、是否超管）
 *   - activeSystemCode：当前正在操作哪个子系统
 *     超管登录在主系统时是空字符串；切到 demo 子系统就变成 'demo'
 *
 * 注意：
 *   权限判断在前端只是「显不显示」，真正的拦截在后端守卫里。
 */
export interface LoginUser {
  id: string;
  username: string;
  nickname: string;
  systemId: string;
  systemCode: string;
  systemName: string;
  isSuper: boolean;
  permissions: string[];
  roleId?: string | null;
  roleName?: string | null;
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null as LoginUser | null,
    /** 超管切换到的子系统编码；空 = 在自己所属的系统里操作 */
    activeSystemCode: localStorage.getItem(SYSTEM_CODE_KEY) || "",
    /** 是否已经从后端拉过用户信息 */
    loaded: false,
  }),

  getters: {
    isLogin: (state) => Boolean(state.token),
    isSuper: (state) => Boolean(state.user?.isSuper),
    /** 当前生效的系统名（用于顶部显示） */
    currentSystemName: (state) => state.user?.systemName || "",
    /**
     * 是否有某个权限。
     * 超管永远返回 true；通配符 '*' 也返回 true。
     */
    hasPermission: (state) => (code: string) => {
      if (!state.user) return false;
      if (state.user.isSuper) return true;
      const permissions = state.user.permissions || [];
      return permissions.includes("*") || permissions.includes(code);
    },
  },

  actions: {
    /**
     * 登录。
     * 成功后把 token 和用户信息写进 localStorage，
     * 这样刷新页面不用重新登录。
     */
    async login(payload: { username: string; password: string; systemCode?: string }) {
      const data = await authApi.login(payload);
      this.token = data.token;
      this.user = data.user;
      this.loaded = true;

      // 登录时选了自己的系统，就不再挂「切换子系统」的请求头
      const ownCode = data.user.systemCode;
      this.activeSystemCode = payload.systemCode && payload.systemCode !== ownCode ? payload.systemCode : "";

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      if (this.activeSystemCode) {
        localStorage.setItem(SYSTEM_CODE_KEY, this.activeSystemCode);
      } else {
        localStorage.removeItem(SYSTEM_CODE_KEY);
      }

      return data.user as LoginUser;
    },

    /** 刷新页面后恢复用户信息（顺便校验 token 是否还有效） */
    async fetchProfile() {
      if (!this.token) return null;
      const user = await authApi.profile();
      this.user = user;
      this.loaded = true;
      return user as LoginUser;
    },

    /**
     * 超管切换「当前操作的子系统」。
     * 切换后所有请求都会自动带 X-System-Code，后端按新子系统做数据隔离。
     */
    setActiveSystem(code: string) {
      this.activeSystemCode = code || "";
      if (code) {
        localStorage.setItem(SYSTEM_CODE_KEY, code);
      } else {
        localStorage.removeItem(SYSTEM_CODE_KEY);
      }
    },

    /** 退出登录：清干净本地状态 */
    logout() {
      this.token = "";
      this.user = null;
      this.loaded = false;
      this.activeSystemCode = "";
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SYSTEM_CODE_KEY);
    },
  },
});
