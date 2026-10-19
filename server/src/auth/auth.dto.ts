/**
 * 认证相关的请求体。
 * 这里故意不用 class-validator 装饰器：参数很少，在 service 里手工校验，
 * 报错信息更好写中文，也少一层反射开销。
 */

export class LoginDto {
    /** 用户名 */
    username: string

    /** 密码（明文，只在 HTTPS/内网传输，服务端立刻 bcrypt 比对，不落库） */
    password: string

    /**
     * 系统编码。留空 = 登录主系统（超管）；
     * 填 "demo" = 登录 demo 子系统的普通用户。
     */
    systemCode?: string
}

export class ChangePasswordDto {
    oldPassword: string
    newPassword: string
}
