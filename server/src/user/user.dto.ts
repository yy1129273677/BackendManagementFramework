/**
 * 用户管理相关的请求体。
 */

export class CreateUserDto {
    /** 登录名，同一子系统内唯一 */
    username: string
    /** 初始密码（明文传输，服务端立刻 bcrypt） */
    password: string
    nickname?: string
    /** 角色 id，必须是本子系统里的角色 */
    roleId?: string
}

export class UpdateUserDto {
    nickname?: string
    /** 1 启用 / 0 停用 */
    status?: number
    roleId?: string | null
    /** 传了才重置密码 */
    password?: string
}
