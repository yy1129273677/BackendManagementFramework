/**
 * 业务字典相关的请求体。
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateDictTypeDto {
  /** 字典编码，比如 order_status */
  @ApiProperty({
    description: "字典编码：小写字母开头，2~32 位小写字母/数字/下划线，子系统内唯一；创建后不可修改",
    minLength: 2,
    maxLength: 32,
    pattern: "^[a-z][a-z0-9_]{1,31}$",
    example: "order_status",
  })
  code: string;
  @ApiProperty({ description: "字典名称", example: "订单状态" })
  name: string;
  @ApiPropertyOptional({ description: "备注", example: "订单流程中的状态" })
  remark?: string;
}

export class UpdateDictTypeDto {
  @ApiPropertyOptional({ description: "字典名称", example: "订单状态" })
  name?: string;
  @ApiPropertyOptional({ description: "备注", example: "订单流程中的状态" })
  remark?: string;
}

export class CreateDictItemDto {
  /** 属于哪个字典类型 */
  @ApiProperty({
    description: "所属字典类型 id，必须是当前子系统下的字典类型",
    example: "5c8e2a1b-3d4f-4e6a-9b7c-2d1e0f3a4b5c",
  })
  dictTypeId: string;
  /** 给人看的文字，比如「已发货」 */
  @ApiProperty({ description: "选项文字（给人看），比如「已发货」", example: "已发货" })
  label: string;
  /** 给程序存的值，比如 shipped */
  @ApiProperty({ description: "选项值（给程序存），同一字典类型下唯一", example: "shipped" })
  value: string;
  @ApiPropertyOptional({ description: "排序值，小的在前，不填按 0 处理", example: 10 })
  sort?: number;
}

export class UpdateDictItemDto {
  @ApiPropertyOptional({ description: "选项文字（给人看）", example: "已发货" })
  label?: string;
  @ApiPropertyOptional({ description: "选项值（给程序存）", example: "shipped" })
  value?: string;
  @ApiPropertyOptional({ description: "排序值，小的在前", example: 10 })
  sort?: number;
  @ApiPropertyOptional({ description: "状态：1 启用 / 0 停用", enum: [0, 1], example: 1 })
  status?: number;
}
