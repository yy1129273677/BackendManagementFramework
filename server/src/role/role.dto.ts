/**
 * 角色相关的请求体。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateRoleDto {
  /** 角色编码，大写字母开头，子系统内唯一 */
  @ApiProperty({
    description:
      "角色编码：大写字母开头，2~32 位大写字母/数字/下划线，子系统内唯一；创建后不可修改，不可使用保留编码 SUPER_ADMIN",
    minLength: 2,
    maxLength: 32,
    pattern: "^[A-Z][A-Z0-9_]{1,31}$",
    example: "ADMIN",
  })
  code: string;
  @ApiProperty({ description: "角色名称", example: "默认管理员" })
  name: string;
  /** 权限码数组，见 server/src/common/constants.ts 的 ALL_PERMISSIONS */
  @ApiPropertyOptional({
    description: "权限码数组，保存时只做格式校验；动态权限码如 menu:<routeId>、data:create:<tcid>:route:<routeId> 均可",
    type: [String],
    example: ["route:read", "user:read", "data:create:TDEMOORDERS"],
  })
  permissions?: string[];
  @ApiPropertyOptional({ description: "备注", example: "新建子系统时自动创建，可按需裁剪权限" })
  remark?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: "角色名称", example: "默认管理员" })
  name?: string;
  @ApiPropertyOptional({
    description: "权限码数组，传入即整体覆盖；只做格式校验，不按固定白名单过滤",
    type: [String],
    example: ["route:read", "user:read", "data:create:TDEMOORDERS"],
  })
  permissions?: string[];
  @ApiPropertyOptional({ description: "备注", example: "可按需裁剪权限" })
  remark?: string;
}
