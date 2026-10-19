import { defineStore } from "pinia";

/**
 * 顶部页签（tags view）状态。
 *
 * 需求 002 第 4 条：内容区顶部要有一排 tag，点一下切换页面，× 关掉。
 *
 * 设计取舍：
 *   - 只做「记录访问过的页面 + 切换 + 关闭」，不做 iframe/keep-alive 缓存，
 *     切换等同路由跳转（页面会重新拉数据）。要缓存的话下一步给 router-view 套 keep-alive。
 *   - 首页固定不可关，避免关完一个不剩没有落点。
 */
export interface TabItem {
  /** 路由路径（唯一标识） */
  path: string;
  title: string;
  /** 是否可以关闭（首页 false） */
  closable: boolean;
}

const HOME_TAB: TabItem = { path: "/dashboard", title: "首页", closable: false };

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [HOME_TAB] as TabItem[],
    /** 当前激活的页签路径 */
    activePath: "/dashboard",
  }),

  actions: {
    /** 访问一个页面时调用：没有就加一个，有就激活 */
    open(path: string, title: string): void {
      if (!path || path.startsWith("/login")) return;
      this.activePath = path;

      if (this.tabs.some((tab) => tab.path === path)) return;
      this.tabs.push({ path, title: title || path, closable: path !== HOME_TAB.path });
    },

    /** 关闭一个页签，返回关闭后应该跳转的路径（let 调用方决定怎么跳） */
    close(path: string): string | null {
      const index = this.tabs.findIndex((tab) => tab.path === path);
      if (index < 0) return null;
      if (!this.tabs[index].closable) return null;

      this.tabs.splice(index, 1);

      // 关掉的不是当前页：不用跳
      if (this.activePath !== path) return null;

      // 关掉当前页：跳到右边那个，没有就左边
      const next = this.tabs[index] || this.tabs[index - 1] || HOME_TAB;
      this.activePath = next.path;
      return next.path;
    },

    /** 关闭其它页签（保留首页和当前页） */
    closeOthers(path: string): void {
      this.tabs = this.tabs.filter((tab) => !tab.closable || tab.path === path);
      this.activePath = path;
    },

    /** 关闭所有可关闭页签，回到首页 */
    closeAll(): string {
      this.tabs = this.tabs.filter((tab) => !tab.closable);
      this.activePath = HOME_TAB.path;
      return HOME_TAB.path;
    },

    /** 退出登录/切换子系统时重置 */
    reset(): void {
      this.tabs = [HOME_TAB];
      this.activePath = HOME_TAB.path;
    },
  },
});
