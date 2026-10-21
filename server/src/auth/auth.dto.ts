/**
 * 认证相关的请求体。
 * 这里故意不用 class-validator 装饰器：参数很少，在 service 里手工校验，
 * 报错信息更好写中文，也少一层反射开销。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LoginDto {
  /** 用户名 */
  @ApiProperty({ description: "登录用户名", example: "demo" })
  username: string;

  /** 密码（明文，只在 HTTPS/内网传输，服务端立刻 bcrypt 比对，不落库） */
  @ApiProperty({ description: "登录密码（明文传输，服务端用 bcrypt 比对，不落库）", example: "demo123456" })
  password: string;

  /**
   * 系统编码。留空 = 登录主系统（超管）；
   * 填 "demo" = 登录 demo 子系统的普通用户。
   */
  @ApiPropertyOptional({
    description: "系统编码：留空登录主系统（超管），填子系统编码则登录对应子系统",
    example: "demo",
  })
  systemCode?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: "原密码，服务端会用 bcrypt 校验，校验不通过返回 400", example: "demo123456" })
  oldPassword: string;
  @ApiProperty({ description: "新密码，至少 8 位", minLength: 8, example: "demo654321" })
  newPassword: string;
}
