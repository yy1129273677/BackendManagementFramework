/**
 * 子系统（租户）相关的请求体。
 */

export class CreateSystemDto {
  /** 系统编码：小写字母开头，可含小写字母/数字/下划线/短横线，登录时要用 */
  code: string;
  /** 子系统名称 */
  name: string;
  /** 备注 */
  remark?: string;
}

export class UpdateSystemDto {
  name?: string;
  remark?: string;
  /** 1 启用 / 0 停用 */
  status?: number;
}
