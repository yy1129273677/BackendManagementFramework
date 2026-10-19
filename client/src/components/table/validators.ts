import type { FormFieldRules, TableField } from "./types";

/**
 * 表单自定义校验器注册表。
 *
 * 背景（需求 002 第 5 条）：
 *   字段配置里可以写「验证规则」，包括正则和自定义联动校验。
 *   自定义校验**不能**把 JS 代码存进数据库（那等于给后台开了任意代码执行的口子），
 *   所以这里做一套注册机制：
 *     - 开发者在本文件（或自己的页面里）调用 registerValidator("名字", fn) 注册函数
 *     - 表格配置里只存名字，运行时按名字查函数
 *
 * 校验函数签名：
 *   (value, formModel) => 返回 null / true 表示通过；返回字符串表示错误提示
 *
 * 为什么要把 formModel 传进去：
 *   需求里要求「验证规则可自定义联动，函数中可以拿到 form 表单信息」——
 *   比如「结束日期必须大于开始日期」这种规则，必须能读同一表单里的其它字段。
 */

export type CustomValidator = (value: any, formModel: Record<string, any>) => string | null | boolean | undefined;

/** 名字 → 校验函数 */
const validatorRegistry = new Map<string, CustomValidator>();

/** 注册一个自定义校验器（重名会覆盖，方便项目里按需改写） */
export function registerValidator(name: string, validator: CustomValidator): void {
  validatorRegistry.set(name, validator);
}

/** 按名字取校验器；没有就返回 undefined（配置里写了不存在的名字时不至于崩） */
export function getValidator(name: string): CustomValidator | undefined {
  return validatorRegistry.get(name);
}

/** 已注册的校验器名字列表（后台配置界面的下拉框用） */
export function listValidators(): string[] {
  return [...validatorRegistry.keys()].sort();
}

/** 内置常用正则：配置界面里可以直接选，不用让人手打 */
export const PRESET_PATTERNS: Array<{ label: string; pattern: string; message: string }> = [
  { label: "手机号（中国大陆）", pattern: "^1[3-9]\\d{9}$", message: "请输入正确的手机号" },
  { label: "邮箱", pattern: "^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$", message: "请输入正确的邮箱" },
  { label: "身份证号（18 位）", pattern: "^\\d{17}[\\dXx]$", message: "请输入正确的身份证号" },
  { label: "正整数", pattern: "^[1-9]\\d*$", message: "请输入正整数" },
  { label: "网址", pattern: "^https?://[\\w.-]+(/[\\w./?%&=-]*)?$", message: "请输入正确的网址" },
  { label: "邮政编码", pattern: "^[1-9]\\d{5}$", message: "请输入正确的邮政编码" },
];

/**
 * 执行一条字段规则的校验。
 *
 * 参数：
 *   field     - 字段定义（含 rules）
 *   value     - 当前值
 *   formModel - 整个表单的值（给联动校验用）
 *
 * 返回：
 *   通过时返回 null；不通过时返回要展示的错误文案
 */
export function runFieldRules(field: TableField, value: any, formModel: Record<string, any>): string | null {
  const rules: FormFieldRules | undefined = field?.rules;
  if (!rules) return null;

  const isEmpty = value === undefined || value === null || value === "";

  // 正则校验：空值不校验（必填由 required 单独管，避免「不填也报格式错」）
  if (rules.pattern && !isEmpty) {
    let regExp: RegExp | null = null;
    try {
      regExp = new RegExp(rules.pattern);
    } catch {
      // 配置里的正则写错了：不让页面白屏，提示配置问题
      return `字段「${field.label}」的校验正则配置有误`;
    }
    if (!regExp.test(String(value))) {
      return rules.message || `字段「${field.label}」格式不正确`;
    }
  }

  // 自定义校验：空值也交给它判断（有些联动规则需要检查「另一个字段填了但本字段没填」）
  if (rules.validator) {
    const validator = getValidator(rules.validator);
    if (validator) {
      const result = validator(value, formModel);
      if (typeof result === "string" && result) return result;
      if (result === false) return rules.message || `字段「${field.label}」校验未通过`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 内置校验器（开箱即用，配置里选名字即可）
// ---------------------------------------------------------------------------

registerValidator("phone", (value) => (!value || /^1[3-9]\d{9}$/.test(String(value)) ? null : "请输入正确的手机号"));

registerValidator("email", (value) =>
  !value || /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(String(value)) ? null : "请输入正确的邮箱",
);

registerValidator("idCard", (value) =>
  !value || /^\d{17}[\dXx]$/.test(String(value)) ? null : "请输入正确的身份证号",
);

/** 示例：联动校验——「第二字段不能和第一字段相同」这类规则可以按需注册 */
registerValidator("notSameAs", (value, formModel) => {
  // 约定：规则名后面通过字段名约定，这里演示读取整个表单
  const firstValue = formModel?.start_value;
  if (firstValue !== undefined && value !== undefined && String(value) === String(firstValue)) {
    return "不能与开始值相同";
  }
  return null;
});
