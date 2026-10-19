import { BadRequestException } from "@nestjs/common";

/**
 * 路由 JSON 配置里的「内嵌表格 TCID」声明。
 *
 * 背景（需求 004 调整）：
 *   自定义页面（CUSTOM 路由）里可以写一个或多个 `<Table :tcid="...">`。
 *   一开始是「构建时扫描源码」生成映射，但每次改页面都要重新扫描，太麻烦。
 *   现在改成**在路由的 JSON 配置里声明**：
 *
 *     { "tcids": ["TDEMOORDERS", "TGOODS0001"] }
 *
 *   后端据此：
 *     1. 读权限：勾了这个页面菜单 → 页面里声明的表都能读
 *     2. 按钮权限：权限树「表格按钮」分组里本来就有这些表（每张表一次），可直接勾
 *
 * 为什么放在 config 里而不是给 Route 加字段：
 *   config 本来就是「路由级任意配置」，加字段要改表结构 + 迁移；放在 JSON 里零迁移，
 *   而且路由管理界面的「JSON 配置」文本域已经能编辑它。
 */

/** TCID 固定格式：T + 大写字母数字（和 table-config 生成规则一致） */
const TCID_PATTERN = /^T[A-Z0-9]{6,20}$/;
/** 一个页面最多声明多少张表（防止误贴一堆） */
const MAX_TCIDS = 50;

/** 从配置里取出原始声明（兼容 TCIDS / tcids 两种写法） */
function rawTcids(config: any): any {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  if (config.TCIDS !== undefined) return config.TCIDS;
  if (config.tcids !== undefined) return config.tcids;
  return undefined;
}

/**
 * 解析并校验配置里的 TCID 声明（严格版，保存路由时用）。
 *
 * 规则：
 *   - 没配置 → 返回空数组（表示这个页面不声明内嵌表格）
 *   - 必须是字符串数组，每一项形如 TDEMOORDERS（自动转大写、去重）
 *   - 最多 50 个
 *
 * @throws BadRequestException 配置不合法时给出人话错误
 */
export function normalizeConfigTcids(config: any): string[] {
  const raw = rawTcids(config);
  if (raw === undefined) return [];

  if (!Array.isArray(raw)) {
    throw new BadRequestException('JSON 配置里的 "tcids" 必须是数组，例如 {"tcids":["TDEMOORDERS"]}');
  }

  const result: string[] = [];
  for (const item of raw) {
    const code = String(item ?? "")
      .trim()
      .toUpperCase();
    if (!TCID_PATTERN.test(code)) {
      throw new BadRequestException(`"tcids" 里的「${item}」不是合法的 TCID（形如 TDEMOORDERS）`);
    }
    if (!result.includes(code)) result.push(code);
  }

  if (result.length > MAX_TCIDS) {
    throw new BadRequestException(`"tcids" 最多 ${MAX_TCIDS} 个`);
  }
  return result;
}

/**
 * 宽松版：从已保存的配置里读 TCID 声明（读权限/权限树用）。
 *
 * 为什么不抛错：历史数据里可能存了不合法的值（比如手改过数据库），
 * 这里读的时候忽略非法项即可，不能因为一条脏配置把整个权限树/数据接口打挂。
 */
export function declaredTcids(config: any): string[] {
  try {
    return normalizeConfigTcids(config);
  } catch {
    return [];
  }
}
