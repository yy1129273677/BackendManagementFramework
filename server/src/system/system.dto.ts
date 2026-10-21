/**
 * 子系统（租户）相关的请求体。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateSystemDto {
  /** 系统编码：小写字母开头，可含小写字母/数字/下划线/短横线，登录时要用 */
  @ApiProperty({
    description:
      "系统编码：小写字母开头，只能包含小写字母、数字、下划线、短横线，长度 2~32 位；登录时使用，创建后不可修改",
    minLength: 2,
    maxLength: 32,
    pattern: "^[a-z][a-z0-9_-]{1,31}$",
    example: "demo",
  })
  code: string;
  /** 子系统名称 */
  @ApiProperty({ description: "子系统名称", example: "演示子系统" })
  name: string;
  /** 备注 */
  @ApiPropertyOptional({ description: "备注", example: "演示环境，可随时清理" })
  remark?: string;
}

export class UpdateSystemDto {
  @ApiPropertyOptional({ description: "子系统名称", example: "演示子系统" })
  name?: string;
  @ApiPropertyOptional({ description: "备注", example: "演示环境，可随时清理" })
  remark?: string;
  /** 1 启用 / 0 停用 */
  @ApiPropertyOptional({ description: "状态：1 启用 / 0 停用", enum: [0, 1], example: 1 })
  status?: number;
}
