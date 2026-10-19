import { hasRouteScopedPermission, routeScopedPermission } from "./permission-scope";

/**
 * 「按路由区分」权限码的单测。
 *
 * 用户诉求：同一张表被两条路由引用时，两条路由下的按钮应该是**两个独立权限**，
 * 取消一个不影响另一个。做法是权限树生成 `<基础码>:route:<路由id>`，
 * 后端判断时同时兼容老的基础码（所有路由通用）。
 */
describe("permission-scope 路由级权限码", () => {
  const routeA = "route-a";

  it("生成路由级权限码", () => {
    expect(routeScopedPermission("data:create:TDEMOORDERS", routeA)).toBe("data:create:TDEMOORDERS:route:route-a");
  });

  it("没有基础码 / 路由 id 时返回 null", () => {
    expect(routeScopedPermission("", routeA)).toBeNull();
    expect(routeScopedPermission("data:create:TDEMOORDERS", undefined)).toBeNull();
    expect(routeScopedPermission("data:create:TDEMOORDERS", "")).toBeNull();
  });

  it("超管永远有权限", () => {
    expect(hasRouteScopedPermission([], true, "data:create:TDEMOORDERS", routeA)).toBe(true);
  });

  it("用户只有本路由级码 → 在本路由可以通过", () => {
    const permissions = ["data:create:TDEMOORDERS:route:route-a"];
    expect(hasRouteScopedPermission(permissions, false, "data:create:TDEMOORDERS", routeA)).toBe(true);
  });

  it("用户只有别的路由级码 → 在本路由不通过（两条路由互相独立）", () => {
    const permissions = ["data:create:TDEMOORDERS:route:route-b"];
    expect(hasRouteScopedPermission(permissions, false, "data:create:TDEMOORDERS", routeA)).toBe(false);
  });

  it("老角色上的基础码（所有路由通用）继续放行", () => {
    expect(hasRouteScopedPermission(["data:create:TDEMOORDERS"], false, "data:create:TDEMOORDERS", routeA)).toBe(true);
    // 更老的全局码也放行
    expect(hasRouteScopedPermission(["data:create"], false, "data:create", routeA)).toBe(true);
  });

  it("基础码为空（没配权限码）时放行，由上层限制", () => {
    expect(hasRouteScopedPermission([], false, "", routeA)).toBe(true);
    expect(hasRouteScopedPermission([], false, null, routeA)).toBe(true);
  });

  it("没有路由上下文（如 /preview 预览页）时，只认基础码", () => {
    expect(hasRouteScopedPermission(["data:create:TDEMOORDERS"], false, "data:create:TDEMOORDERS", undefined)).toBe(
      true,
    );
    expect(
      hasRouteScopedPermission(["data:create:TDEMOORDERS:route:route-a"], false, "data:create:TDEMOORDERS", undefined),
    ).toBe(false);
  });
});
