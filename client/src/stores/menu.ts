import {defineStore} from 'pinia'
import {routeApi} from '@/api'

/**
 * 菜单（动态路由）状态。
 *
 * 为什么要单独一个 store：
 *   子系统里「有哪些菜单」是数据库里配的，不是代码写死的。
 *   布局组件要把它们渲染成左侧菜单，路由守卫要把它们注册成真实路由，
 *   两边都需要同一份数据，所以放在 store 里。
 */
export interface DynamicRouteItem {
    id: string
    parentId?: string | null
    title: string
    path: string
    type: 'CUSTOM' | 'TABLE'
    componentPath?: string | null
    tcid?: string | null
    icon?: string | null
    sort?: number
    visible?: boolean
    permissionCode?: string | null
}

export const useMenuStore = defineStore('menu', {
    state: () => ({
        /** 当前子系统里、当前用户能看到的路由 */
        dynamicRoutes: [] as DynamicRouteItem[],
        /** 动态路由是否已经加载过（避免每次跳转都请求） */
        loaded: false,
    }),

    getters: {
        /** 按 sort 排序后的菜单 */
        sortedRoutes: (state) => [...state.dynamicRoutes].sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    },

    actions: {
        async load() {
            const {list} = await routeApi.my()
            this.dynamicRoutes = list || []
            this.loaded = true
            return this.dynamicRoutes
        },

        reset() {
            this.dynamicRoutes = []
            this.loaded = false
        },
    },
})
