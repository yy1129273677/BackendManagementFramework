import { declaredTcids, normalizeConfigTcids } from "./route-tcids";

/**
 * 路由 JSON 配置里 tcids 声明的解析/校验单测。
 *
 * 这是「自定义页面内嵌表格」权限的入口：
 * 配错了会导致页面里的表格读不了（或权限树里没有对应表），所以格式必须钉死。
 */
describe("route-tcids 路由配置里的内嵌表格声明", () => {
  it("没配置 → 空数组", () => {
    expect(normalizeConfigTcids(null)).toEqual([]);
    expect(normalizeConfigTcids({})).toEqual([]);
    expect(normalizeConfigTcids({ title: "订单中心" })).toEqual([]);
  });

  it("支持小写 tcids 和大众写法 TCIDS", () => {
    expect(normalizeConfigTcids({ tcids: ["TDEMOORDERS"] })).toEqual(["TDEMOORDERS"]);
    expect(normalizeConfigTcids({ TCIDS: ["TDEMOORDERS"] })).toEqual(["TDEMOORDERS"]);
  });

  it("自动转大写、去重，保留顺序", () => {
    expect(normalizeConfigTcids({ tcids: ["tdemoorders", "TGOODS0001", "TDEMOORDERS"] })).toEqual([
      "TDEMOORDERS",
      "TGOODS0001",
    ]);
  });

  it("不是数组 → 抛 400 级错误", () => {
    expect(() => normalizeConfigTcids({ tcids: "TDEMOORDERS" })).toThrow(/必须是数组/);
  });

  it("不是合法 TCID → 抛错并指出是哪一项", () => {
    expect(() => normalizeConfigTcids({ tcids: ["TDEMOORDERS", "abc"] })).toThrow(/abc/);
    expect(() => normalizeConfigTcids({ tcids: ["T1"] })).toThrow(/T1/);
  });

  it("超过 50 个 → 抛错", () => {
    const many = Array.from({ length: 51 }, (_, index) => `T${String(index).padStart(8, "0")}`);
    expect(() => normalizeConfigTcids({ tcids: many })).toThrow(/最多/);
  });

  it("宽松版 declaredTcids：脏数据不抛错，只忽略非法项", () => {
    expect(declaredTcids(null)).toEqual([]);
    expect(declaredTcids({ tcids: "oops" })).toEqual([]);
    expect(declaredTcids({ tcids: ["TDEMOORDERS", "bad"] })).toEqual([]);
    expect(declaredTcids({ tcids: ["TDEMOORDERS"] })).toEqual(["TDEMOORDERS"]);
  });
});
