/**
 * 用户管理相关的请求体。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateUserDto {
  /** 登录名，同一子系统内唯一 */
  @ApiProperty({
    description: "登录名：字母开头，3~32 位字母/数字/下划线，同一子系统内唯一",
    minLength: 3,
    maxLength: 32,
    pattern: "^[a-zA-Z][a-zA-Z0-9_]{2,31}$",
    example: "zhangsan",
  })
  username: string;
  /** 初始密码（明文传输，服务端立刻 bcrypt） */
  @ApiProperty({
    description: "初始密码（明文传输，服务端用 bcrypt 加密存储），至少 6 位",
    minLength: 6,
    example: "demo123456",
  })
  password: string;
  @ApiPropertyOptional({ description: "昵称，不填默认与用户名相同", example: "张三" })
  nickname?: string;
  /** 角色 id，必须是本子系统里的角色 */
  @ApiPropertyOptional({
    description: "角色 id，必须是当前子系统下的角色；不传表示暂不绑定角色",
    example: "9b2f4c1a-7d3e-4a5b-8c6d-1e2f3a4b5c6d",
  })
  roleId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: "昵称", example: "张三" })
  nickname?: string;
  /** 1 启用 / 0 停用 */
  @ApiPropertyOptional({ description: "状态：1 启用 / 0 停用", enum: [0, 1], example: 1 })
  status?: number;
  @ApiPropertyOptional({
    description: "角色 id，必须是当前子系统下的角色；传 null 表示解除角色绑定，不传表示不改",
    type: String,
    nullable: true,
    example: "9b2f4c1a-7d3e-4a5b-8c6d-1e2f3a4b5c6d",
  })
  roleId?: string | null;
  /** 传了才重置密码 */
  @ApiPropertyOptional({
    description: "新密码，传了才重置（至少 6 位）；不传表示不改密码",
    minLength: 6,
    example: "newPass123",
  })
  password?: string;
}
