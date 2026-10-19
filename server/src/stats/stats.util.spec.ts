import { fillMissingDays, mergeDayCounts, topByCount } from "./stats.util";

/**
 * 统计工具的单元测试。
 * 重点：折线图要连续（缺天补 0）、Top N 排序正确且不改原数组。
 */
describe("stats.util", () => {
  describe("fillMissingDays", () => {
    it("按天补齐 7 天，缺的补 0", () => {
      const now = new Date(2026, 9, 19); // 2026-10-19
      const result = fillMissingDays(
        [
          { day: "10-13", count: 2 },
          { day: "10-19", count: 5 },
        ],
        7,
        now,
      );

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ day: "10-13", count: 2 });
      expect(result[6]).toEqual({ day: "10-19", count: 5 });
      expect(result.filter((item) => item.count === 0)).toHaveLength(5);
    });

    it("从早到晚排序（不是数据库返回的顺序）", () => {
      const now = new Date(2026, 0, 3); // 2026-01-03
      const result = fillMissingDays([], 3, now);
      expect(result.map((item) => item.day)).toEqual(["01-01", "01-02", "01-03"]);
    });

    it("bigint 计数能转成 number", () => {
      const now = new Date(2026, 9, 19);
      const result = fillMissingDays([{ day: "10-19", count: 12n }], 1, now);
      expect(result[0].count).toBe(12);
    });
  });

  describe("topByCount", () => {
    it("按 count 倒序取前 N 个", () => {
      const items = [
        { name: "a", count: 1 },
        { name: "b", count: 9 },
        { name: "c", count: 5 },
      ];
      expect(topByCount(items, 2).map((item) => item.name)).toEqual(["b", "c"]);
    });

    it("不修改原数组", () => {
      const items = [
        { name: "a", count: 1 },
        { name: "b", count: 9 },
      ];
      topByCount(items, 1);
      expect(items[0].name).toBe("a");
    });

    it("limit 非法时兜底为 1", () => {
      expect(topByCount([{ name: "a", count: 1 }], 0)).toHaveLength(1);
    });
  });

  describe("mergeDayCounts", () => {
    it("多张表同一天的数据要累加", () => {
      const merged = mergeDayCounts([
        [
          { day: "10-18", count: 2 },
          { day: "10-19", count: 1 },
        ],
        [
          { day: "10-18", count: 3 },
          { day: "10-20", count: 4 },
        ],
      ]);

      const map = new Map(merged.map((item) => [item.day, item.count]));
      expect(map.get("10-18")).toBe(5);
      expect(map.get("10-19")).toBe(1);
      expect(map.get("10-20")).toBe(4);
    });

    it("空输入返回空数组", () => {
      expect(mergeDayCounts([])).toEqual([]);
      expect(mergeDayCounts([[], []])).toEqual([]);
    });

    it("bigint 计数能正确累加", () => {
      const merged = mergeDayCounts([[{ day: "10-19", count: 2n }], [{ day: "10-19", count: 3n }]]);
      expect(merged[0].count).toBe(5);
    });
  });
});
