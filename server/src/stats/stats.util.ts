/**
 * 统计模块用到的纯函数（不碰数据库，方便单测）。
 */

/**
 * 把「按日期聚合的稀疏数据」补成连续 N 天。
 *
 * 干什么：
 *   数据库 group by 出来的结果只包含"有数据的日期"，比如近 7 天只有 3 天有人注册，
 *   直接画折线图会变成 3 个点，X 轴不连续、看不出趋势。
 *   这里按天补齐，没有数据的天补 0。
 *
 * 参数：
 *   rows - [{ day: "10-01", count: 3 }]，day 格式 MM-DD
 *   days - 要补几天，默认 7
 *   now  - 参考时间（默认当前时间），方便单测固定日期
 *
 * 返回：
 *   按时间从早到晚的连续数组，长度 = days
 */
export function fillMissingDays(
  rows: Array<{ day: string; count: number | bigint }>,
  days = 7,
  now: Date = new Date(),
): Array<{ day: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows || []) {
    map.set(String(row.day), Number(row.count) || 0);
  }

  const result: Array<{ day: string; count: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${month}-${day}`;
    result.push({ day: key, count: map.get(key) ?? 0 });
  }
  return result;
}

/**
 * 取 Top N（按 count 倒序），用于"数据量最大的几张表"这类图表。
 * 不修改原数组。
 */
export function topByCount<T extends { count: number }>(items: T[], limit = 10): T[] {
  return [...(items || [])].sort((a, b) => b.count - a.count).slice(0, Math.max(1, limit));
}

/**
 * 把多张表按天的计数合并成一份。
 *
 * 干什么：
 *   子系统里每张业务表单独 group by 出「某天新增几行」，想画「整个系统每天新增多少数据」
 *   就得把这些结果加起来。比如订单表 10-18 有 2 行、商品表 10-18 有 3 行，合并后是 5 行。
 *
 * 参数：
 *   groups - 多个 [{ day: "10-18", count: 2 }, ...]，每个元素是一张表的查询结果
 *
 * 返回：
 *   合并后的 [{ day, count }]，按 day 去重累加（顺序不保证，通常再过一遍 fillMissingDays）
 */
export function mergeDayCounts(groups: Array<Array<{ day: string; count: number | bigint }>>): Array<{
  day: string;
  count: number;
}> {
  // key 是日期，value 是当天所有表加起来的新增行数
  const merged = new Map<string, number>();
  for (const group of groups || []) {
    for (const row of group || []) {
      const day = String(row.day);
      merged.set(day, (merged.get(day) ?? 0) + (Number(row.count) || 0));
    }
  }
  return [...merged.entries()].map(([day, count]) => ({ day, count }));
}
