import axios, {AxiosInstance, AxiosRequestConfig} from 'axios'
import {ElMessage} from 'element-plus'

/**
 * 统一的 HTTP 请求封装。
 *
 * 干什么：
 *   1. 自动带上登录 token（Authorization: Bearer xxx）
 *   2. 自动带上「当前操作的子系统编码」请求头 X-System-Code
 *      （超管切换子系统就靠它，普通用户带了后端也不认）
 *   3. 把后端 { code, message, data } 的包装拆开，业务代码直接拿 data
 *   4. 统一错误提示；401 自动踢回登录页
 *
 * 注意：
 *   - 这里直接读 localStorage 而不是 import 状态库，是为了避免
 *     「request.ts ← store ← api ← request.ts」的循环依赖
 *   - 后端把错误信息写在 message 里，都是中文，可以直接给用户看
 */

/** localStorage 的键名，登录、切换子系统时会写入 */
export const TOKEN_KEY = 'bmf_token'
export const USER_KEY = 'bmf_user'
export const SYSTEM_CODE_KEY = 'bmf_system_code'

const request: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE || '/api',
    timeout: 30000,
})

/** 请求拦截：补上 token 和子系统标识 */
request.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
    }

    const systemCode = localStorage.getItem(SYSTEM_CODE_KEY)
    if (systemCode && config.headers) {
        config.headers['X-System-Code'] = systemCode
    }
    return config
})

/**
 * 响应拦截：拆包装 + 错误处理。
 *
 * 后端约定成功返回 { code: 0, message: 'ok', data: ... }，
 * 这里直接返回 data，业务代码写 const list = await api.xxx() 就行。
 */
request.interceptors.response.use(
    (response) => {
        const body = response.data
        // 兼容非包装接口（比如以后接文件下载）
        if (body === undefined || body === null || typeof body !== 'object' || !('code' in body)) {
            return body
        }
        if (body.code === 0) return body.data

        ElMessage.error(body.message || '请求失败')
        return Promise.reject(new Error(body.message || '请求失败'))
    },
    (error) => {
        const status = error?.response?.status
        const message = error?.response?.data?.message || error.message || '网络异常'

        if (status === 401) {
            // token 过期或没登录：清掉本地状态，跳回登录页
            localStorage.removeItem(TOKEN_KEY)
            localStorage.removeItem(USER_KEY)
            localStorage.removeItem(SYSTEM_CODE_KEY)
            ElMessage.error('登录状态已失效，请重新登录')
            if (!location.hash.includes('/login')) {
                location.hash = '#/login'
            }
            return Promise.reject(error)
        }

        ElMessage.error(message)
        return Promise.reject(error)
    },
)

/** 带类型提示的简易封装，业务层用这个 */
export async function http<T = any>(config: AxiosRequestConfig): Promise<T> {
    return request.request<any, T>(config)
}

export default request
