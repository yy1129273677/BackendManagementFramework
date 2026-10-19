import { canReadTable } from "./read-access";

/**
 * 表格读权限的单测。
 *
 * 这条规则是用户明确要求的：「菜单勾了就能读这张表的数据，不要再单独勾全局 data:read」。
 * 所以这里锁死：
 *   - 勾了菜单 → 能读
 *   - 没勾菜单、也没有老的 data:read → 不能读
 *   - 公开菜单 → 登录就能读
 */
describe("canReadTable 表格读权限", () => {
  const roleRoute = { id: "r1", accessType: "ROLE", visible: true };
  const publicRoute = { id: "r2", accessType: "PUBLIC", visible: true };

  it("超管永远能读", () => {
    expect(canReadTable([], [], true)).toBe(true);
  });

  it("勾了菜单（menu:<routeId>）就能读这张表的数据", () => {
    expect(canReadTable([roleRoute], ["menu:r1"], false)).toBe(true);
  });

  it("没勾菜单、也不是公开菜单 → 不能读", () => {
    expect(canReadTable([roleRoute], ["route:read"], false)).toBe(false);
  });

  it("老数据兼容：角色上残留全局 data:read 仍然放行", () => {
    expect(canReadTable([roleRoute], ["data:read"], false)).toBe(true);
  });

  it("公开菜单：登录即可读数据", () => {
    expect(canReadTable([publicRoute], [], false)).toBe(true);
  });

  it("隐藏的菜单不授权读数据", () => {
    expect(canReadTable([{ id: "r3", accessType: "PUBLIC", visible: false }], [], false)).toBe(false);
    expect(canReadTable([{ id: "r4", accessType: "ROLE", visible: false }], ["menu:r4"], false)).toBe(false);
  });

  it("表格没有绑定任何菜单时，只有超管或老的 data:read 能读", () => {
    expect(canReadTable([], [], false)).toBe(false);
    expect(canReadTable([], ["data:read"], false)).toBe(true);
  });

  it("同一张表绑了多个菜单时，命中任意一个即可", () => {
    const routes = [
      { id: "r-a", accessType: "ROLE", visible: true },
      { id: "r-b", accessType: "ROLE", visible: true },
    ];
    expect(canReadTable(routes, ["menu:r-b"], false)).toBe(true);
  });
});
