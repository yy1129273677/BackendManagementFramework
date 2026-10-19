/**
 * 业务字典相关的请求体。
 */

export class CreateDictTypeDto {
  /** 字典编码，比如 order_status */
  code: string;
  name: string;
  remark?: string;
}

export class UpdateDictTypeDto {
  name?: string;
  remark?: string;
}

export class CreateDictItemDto {
  /** 属于哪个字典类型 */
  dictTypeId: string;
  /** 给人看的文字，比如「已发货」 */
  label: string;
  /** 给程序存的值，比如 shipped */
  value: string;
  sort?: number;
}

export class UpdateDictItemDto {
  label?: string;
  value?: string;
  sort?: number;
  status?: number;
}
