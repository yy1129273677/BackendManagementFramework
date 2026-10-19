import { isUserActive, toJwtUser } from "./jwt-user";

/**
 * 「每次请求实时算权限」的规则测试。
 *
 * 用户的诉求：改完角色权限后，用户刷新页面（F5）就能看到新菜单，
 * 不需要退出重新登录。所以 token 只证明身份，权限必须每次从库里重算。
 */
describe("toJwtUser 实时权限", () => {
  const base = {
    id: "u1",
    username: "user1",
    nickname: null,
    systemId: "sys-1",
    roleId: "role-1",
    status: 1,
  };

  it("主系统 + SUPER_ADMIN 角色 → 超管，权限固定通配", () => {
    const user = toJwtUser({
      ...base,
      role: { code: "SUPER_ADMIN", name: "超级管理员", permissions: ["role:read"] },
      system: { code: "main", isMain: true },
    });

    expect(user.isSuper).toBe(true);
    expect(user.permissions).toEqual(["*"]);
  });

  it("子系统里的 SUPER_ADMIN 角色不算超管（超管只在主系统）", () => {
    const user = toJwtUser({
      ...base,
      role: { code: "SUPER_ADMIN", permissions: [] },
      system: { code: "demo", isMain: false },
    });

    expect(user.isSuper).toBe(false);
    expect(user.permissions).toEqual([]);
  });

  it("普通用户取角色上的最新权限（改完角色下一次请求就生效）", () => {
    const user = toJwtUser({
      ...base,
      role: { code: "USER", permissions: ["menu:r1", "data:create:T1"] },
      system: { code: "demo", isMain: false },
    });

    expect(user.isSuper).toBe(false);
    expect(user.permissions).toEqual(["menu:r1", "data:create:T1"]);
  });

  it("没有角色 / 角色没有权限 → 空权限，不会报错", () => {
    const user = toJwtUser({ ...base, role: null, system: { code: "demo", isMain: false } });
    expect(user.permissions).toEqual([]);
    expect(user.roleId).toBe("role-1");
  });

  it("nickname 为空时用 username 兜底", () => {
    const user = toJwtUser({ ...base, role: null, system: { code: "demo", isMain: false } });
    expect(user.nickname).toBe("user1");
  });
});

describe("isUserActive 账号可用性", () => {
  it("status=1 可用", () => {
    expect(isUserActive({ id: "u1", username: "u", systemId: "s", status: 1 })).toBe(true);
  });

  it("status=0 被禁用", () => {
    expect(isUserActive({ id: "u1", username: "u", systemId: "s", status: 0 })).toBe(false);
  });

  it("用户不存在（null）不可用", () => {
    expect(isUserActive(null)).toBe(false);
  });

  it("status 缺失按可用处理（老数据兼容）", () => {
    expect(isUserActive({ id: "u1", username: "u", systemId: "s" })).toBe(true);
  });
});
