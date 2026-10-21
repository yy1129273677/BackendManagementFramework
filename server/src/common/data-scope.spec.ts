import { normalizeDataScope, resolveDataScope, viewAllPermissionCode } from "./data-scope";

/**
 * 表级数据范围（行级隔离）的单测。
 *
 * 关注点：
 *   1. 默认 ALL，老表行为不变
 *   2. OWN 分别作用于读 / 写
 *   3. 超管始终全量
 *   4. data:viewAll:<tcid> 只放开读，不放开写（写隔离仍按 write_scope）
 */
describe("数据范围 resolveDataScope", () => {
  const tcid = "TORDER0001";

  it("默认（不传范围）是全量读写", () => {
    const scope = resolveDataScope({ tcid, isSuper: false, permissions: [] });
    expect(scope).toEqual({ readAll: true, writeAll: true, viewAll: false });
  });

  it("readScope=OWN 时只读自己的数据，写范围不受影响", () => {
    const scope = resolveDataScope({
      tcid,
      readScope: "OWN",
      writeScope: "ALL",
      isSuper: false,
      permissions: [],
    });
    expect(scope.readAll).toBe(false);
    expect(scope.writeAll).toBe(true);
  });

  it("writeScope=OWN 时只能改自己的数据，读范围不受影响", () => {
    const scope = resolveDataScope({
      tcid,
      readScope: "ALL",
      writeScope: "OWN",
      isSuper: false,
      permissions: [],
    });
    expect(scope.readAll).toBe(true);
    expect(scope.writeAll).toBe(false);
  });

  it("超管始终全量，即使两个范围都是 OWN", () => {
    const scope = resolveDataScope({
      tcid,
      readScope: "OWN",
      writeScope: "OWN",
      isSuper: true,
      permissions: [],
    });
    expect(scope.readAll).toBe(true);
    expect(scope.writeAll).toBe(true);
  });

  it("命中 data:viewAll:<tcid> 基础码 → 读范围放开，写范围仍按 write_scope", () => {
    const scope = resolveDataScope({
      tcid,
      readScope: "OWN",
      writeScope: "OWN",
      isSuper: false,
      permissions: [viewAllPermissionCode(tcid)],
    });
    expect(scope.viewAll).toBe(true);
    expect(scope.readAll).toBe(true);
    expect(scope.writeAll).toBe(false);
  });

  it("路由级 viewAll 权限只在该路由下生效", () => {
    const permissions = [`${viewAllPermissionCode(tcid)}:route:r-order`];

    const inRoute = resolveDataScope({
      tcid,
      readScope: "OWN",
      writeScope: "OWN",
      isSuper: false,
      permissions,
      routeId: "r-order",
    });
    expect(inRoute.readAll).toBe(true);

    const otherRoute = resolveDataScope({
      tcid,
      readScope: "OWN",
      writeScope: "OWN",
      isSuper: false,
      permissions,
      routeId: "r-other",
    });
    expect(otherRoute.readAll).toBe(false);
  });

  it("不认识的 readScope 值按全量处理（数据库里只会有 ALL/OWN）", () => {
    const scope = resolveDataScope({ tcid, readScope: "WHATEVER", writeScope: undefined, isSuper: false });
    expect(scope.readAll).toBe(true);
    expect(scope.writeAll).toBe(true);
  });
});

describe("数据范围 normalizeDataScope", () => {
  it("不传时用默认值", () => {
    expect(normalizeDataScope(undefined)).toBe("ALL");
    expect(normalizeDataScope("", "OWN")).toBe("OWN");
  });

  it("大小写不敏感", () => {
    expect(normalizeDataScope("own")).toBe("OWN");
    expect(normalizeDataScope(" ALL ")).toBe("ALL");
  });

  it("非法值直接报错，避免拼错后静默全开", () => {
    expect(() => normalizeDataScope("SELF")).toThrow(/ALL/);
  });
});
