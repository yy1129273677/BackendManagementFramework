import { canSeeRoute } from "./route-visibility";

/**
 * 菜单可见性判断的单测。
 *
 * 这些用例是为了防两个已发生的坑复发：
 *   1. accessType=ROLE 的路由被老字段 permissionCode 挡住（user1 案例）
 *   2. 公开菜单被误加权限校验
 */
describe("canSeeRoute 菜单可见性", () => {
  const roleRoute = { id: "r1", accessType: "ROLE", permissionCode: "read" };
  const publicRoute = { id: "r2", accessType: "PUBLIC" };

  it("超管能看到所有菜单", () => {
    expect(canSeeRoute(roleRoute, [], true)).toBe(true);
    expect(canSeeRoute(publicRoute, [], true)).toBe(true);
  });

  it("按角色菜单：有 menu:<routeId> 就可见", () => {
    expect(canSeeRoute(roleRoute, ["menu:r1"], false)).toBe(true);
  });

  it("按角色菜单：没有 menu:<routeId> 就不可见", () => {
    expect(canSeeRoute(roleRoute, ["route:read"], false)).toBe(false);
  });

  it("按角色菜单：老 permissionCode 不满足时，也不能挡住新权限（回归用例）", () => {
    // 路由上残留 permissionCode="read"，用户没有 read，但有 menu:r1
    expect(canSeeRoute({ id: "r1", accessType: "ROLE", permissionCode: "read" }, ["menu:r1"], false)).toBe(true);
  });

  it("公开菜单：没有配置权限码时，登录即可见", () => {
    expect(canSeeRoute(publicRoute, [], false)).toBe(true);
  });

  it("公开菜单 + 老 permissionCode：仍然按老权限码控制（兼容老数据）", () => {
    const legacy = { id: "r3", accessType: "PUBLIC", permissionCode: "data:read" };
    expect(canSeeRoute(legacy, ["data:read"], false)).toBe(true);
    expect(canSeeRoute(legacy, [], false)).toBe(false);
  });

  it("accessType 为空的老数据按 PUBLIC 处理", () => {
    expect(canSeeRoute({ id: "r4", accessType: null, permissionCode: null }, [], false)).toBe(true);
  });
});
