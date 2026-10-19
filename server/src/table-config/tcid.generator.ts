import { randomInt } from "node:crypto";

/**
 * TCID 生成器。
 *
 * TCID 是什么：
 *   在后台配置一张表格后，系统给它发一个编号，形如 TDEMOORDERS。
 *   前端只要拿到这个编号，就能把整张表渲染出来（列、搜索项、按钮全在配置里）。
 *   编号一旦生成不再变化，路由、前端代码、缓存都以它为准。
 *
 * 为什么这样设计：
 *   1. 用随机字符而不是自增数字，避免被人从编号推算出「你有多少张表」
 *   2. 去掉容易看错的 0/1/I/O，人工抄写不会错
 *   3. 固定 11 位（T + 10 位），前端输入框可以按长度做校验
 */

/**
 * 编码字符集：数字只用 2~9，字母 A~Z 全保留。
 *
 * 为什么排除 0 和 1：
 *   0 和 1 最容易和 O、I 看错。既然数字 0/1 根本不会出现，
 *   字母 O/I 就不会有歧义了，所以可以保留——这样人工可读的
 *   TCID（比如演示用的 TDEMOORDERS）也能合法。
 */
export const TCID_ALPHABET = "23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** TCID 固定前缀 */
export const TCID_PREFIX = "T";

/** 随机部分长度 */
export const TCID_RANDOM_LENGTH = 10;

/** TCID 总长度 */
export const TCID_LENGTH = TCID_PREFIX.length + TCID_RANDOM_LENGTH;

/**
 * 生成一个新的 TCID。
 *
 * 返回：
 *   形如 "T7K2M9QXAB" 的 11 位字符串
 *
 * 注意：
 *   理论上 32^10 种组合，实际撞车概率可以忽略；调用方仍然要处理唯一冲突（重试）。
 */
export function generateTcid(): string {
  let random = "";
  for (let i = 0; i < TCID_RANDOM_LENGTH; i += 1) {
    random += TCID_ALPHABET[randomInt(0, TCID_ALPHABET.length)];
  }
  return `${TCID_PREFIX}${random}`;
}

/**
 * 校验一个字符串是不是合法的 TCID 格式。
 *
 * 用途：
 *   前端输入框校验、接口参数预检、导入配置时的防呆。
 *   注意：格式合法不代表这个 TCID 真的存在，存在性要查数据库。
 */
export function isValidTcid(tcid: string): boolean {
  if (typeof tcid !== "string" || tcid.length !== TCID_LENGTH) return false;
  if (!tcid.startsWith(TCID_PREFIX)) return false;
  for (const char of tcid.slice(TCID_PREFIX.length)) {
    if (!TCID_ALPHABET.includes(char)) return false;
  }
  return true;
}
