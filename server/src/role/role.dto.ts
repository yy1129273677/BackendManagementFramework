/**
 * 角色相关的请求体。
 */

export class CreateRoleDto {
    /** 角色编码，大写字母开头，子系统内唯一 */
    code: string
    name: string
    /** 权限码数组，见 server/src/common/constants.ts 的 ALL_PERMISSIONS */
    permissions?: string[]
    remark?: string
}

export class UpdateRoleDto {
    name?: string
    permissions?: string[]
    remark?: string
}
