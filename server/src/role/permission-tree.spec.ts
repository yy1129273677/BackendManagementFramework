import {
  buildPermissionTree,
  menuPermissionCode,
  tableActionPermission,
  tableOperationPermission,
} from "./permission-tree";

/**
 * 权限树构建的单测。
 *
 * 结构（2026-10-19 最终版）：
 *   系统功能 —— 管理能力（用户/角色/字典/表格配置/路由…）
 *   菜单与按钮 —— 路由菜单；TABLE 路由下面挂这张表的按钮，
 *                 CUSTOM 页面按 JSON 配置里的 `tcids` 挂对应表的按钮
 *
 * 前端角色页的 el-tree 开了 `check-strictly`（父子不联动）：
 *   取消某个按钮只影响该按钮，不会把父菜单变成半选、也不会丢菜单权限。
 *   所以这里允许「同一张表的按钮在多个入口下各出现一份」——它们指向同一个权限码，
 *   保存时按权限码去重；关键约束是 **key 必须唯一**（否则 el-tree 勾选会串）。
 */
describe("buildPermissionTree 权限树", () => {
  const routes = [
    { id: "r-home", title: "首页", type: "CUSTOM" as const, accessType: "PUBLIC", sort: 1 },
    { id: "r-order", title: "订单管理", type: "TABLE" as const, tcid: "TORDER0001", accessType: "ROLE", sort: 2 },
    {
      id: "r-order-detail",
      title: "订单详情",
      type: "CUSTOM" as const,
      parentId: "r-order",
      accessType: "ROLE",
      sort: 1,
    },
    { id: "r-open", title: "公开页面", type: "CUSTOM" as const, accessType: "PUBLIC", sort: 3 },
    {
      id: "r-page",
      title: "自定义页面示例",
      type: "CUSTOM" as const,
      accessType: "ROLE",
      // 自定义页面内嵌了哪些表，写在路由 JSON 配置的 tcids 里
      config: { tcids: ["TORDER0001"] },
      sort: 4,
    },
    {
      id: "r-page-none",
      title: "没有内嵌表格的页面",
      type: "CUSTOM" as const,
      accessType: "ROLE",
      config: { title: "随便什么" },
      sort: 5,
    },
  ];

  const tableConfigs = [
    {
      tcid: "TORDER0001",
      name: "订单列表",
      operations: {
        create: true,
        update: true,
        delete: false,
        createPermission: "data:create:TORDER0001",
        updatePermission: "",
        deletePermission: "",
      },
      customActions: [
        { label: "标记发货", value: "ship", permission: "data:action:TORDER0001:ship" },
        { label: "查看详情", value: "detail" },
      ],
    },
    {
      tcid: "TGOODS0001",
      name: "商品列表",
      operations: { create: true, update: true, delete: true },
      customActions: [],
    },
  ];

  /** 路由级权限码：基础码 + :route:<routeId>（用户要求按路由区分权限） */
  function scoped(base: string, routeId: string): string {
    return `${base}:route:${routeId}`;
  }

  function build() {
    return buildPermissionTree({ routes, tableConfigs });
  }

  function findNode(tree: any[], title: string): any {
    for (const node of tree) {
      if (node.title === title) return node;
      const found = findNode(node.children || [], title);
      if (found) return found;
    }
    return null;
  }

  it("顶层分成「系统功能 / 菜单与按钮」两个分组", () => {
    const { tree } = build();
    expect(tree.map((node) => node.title)).toEqual(["系统功能", "菜单与按钮"]);
  });

  it("公开菜单节点显示但不可勾选，并给出说明", () => {
    const { tree } = build();
    const home = findNode(tree, "首页");
    expect(home.disabled).toBe(true);
    expect(home.note).toContain("公开菜单");
    expect(home.code).toBe(menuPermissionCode("r-home"));
  });

  it("ROLE 菜单节点可勾选，权限码是 menu:<routeId>", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    expect(order.disabled).toBeFalsy();
    expect(order.code).toBe("menu:r-order");
  });

  it("子菜单挂在父菜单的 children 里", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const child = (order.children || []).find((node: any) => node.title === "订单详情");
    expect(child).toBeTruthy();
    expect(child.code).toBe("menu:r-order-detail");
  });

  it("TABLE 菜单下面挂这张表的按钮：开启的操作有，关闭的（删除）没有", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const titles = order.children.map((node: any) => node.title);

    expect(titles).toContain("新增（订单列表）");
    expect(titles).toContain("修改（订单列表）");
    expect(titles).not.toContain("删除（订单列表）"); // delete 被关闭
  });

  it("按钮权限码：配置优先，没配就用按 TCID 生成的默认码", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const codes = order.children.map((node: any) => node.code);

    expect(codes).toContain(scoped("data:create:TORDER0001", "r-order")); // 配置里写死的
    expect(codes).toContain(scoped(tableOperationPermission("TORDER0001", "update"), "r-order")); // 没配 → 默认码
  });

  it("自定义按钮：配了权限码的可勾选；没配的禁用并说明", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");

    const ship = order.children.find((node: any) => node.title.startsWith("标记发货"));
    expect(ship.disabled).toBeFalsy();
    expect(ship.code).toBe(scoped(tableActionPermission("TORDER0001", "ship"), "r-order"));

    const detail = order.children.find((node: any) => node.title.startsWith("查看详情"));
    expect(detail.disabled).toBe(true);
    expect(detail.note).toContain("未配置权限码");
  });

  it("自定义页面按 JSON 配置的 tcids 挂对应表的按钮，并给出说明", () => {
    const { tree } = build();
    const page = findNode(tree, "自定义页面示例");

    expect(page.note).toContain("页面内嵌表格：订单列表");
    const titles = page.children.map((node: any) => node.title);
    expect(titles).toContain("新增（订单列表）");
    expect(titles).toContain("修改（订单列表）");
    expect(page.children.map((node: any) => node.code)).toContain(scoped("data:create:TORDER0001", "r-page"));
  });

  it("没有声明 tcids 的自定义页面下面没有按钮、也不会有内嵌表格说明", () => {
    const { tree } = build();
    const page = findNode(tree, "没有内嵌表格的页面");
    expect(page.note).not.toContain("页面内嵌表格");
    expect(page.children).toHaveLength(0);
  });

  it("同一张表被两条路由引用时，各自生成【不同】的路由级权限码（互相独立）", () => {
    const { tree, keyMap } = build();

    // 订单管理（TABLE）和 自定义页面示例（CUSTOM，tcids 里也声明了这张表）
    const order = findNode(tree, "订单管理");
    const page = findNode(tree, "自定义页面示例");
    const orderCreate = order.children.find((node: any) => node.title === "新增（订单列表）");
    const pageCreate = page.children.find((node: any) => node.title === "新增（订单列表）");

    expect(orderCreate.code).toBe(scoped("data:create:TORDER0001", "r-order"));
    expect(pageCreate.code).toBe(scoped("data:create:TORDER0001", "r-page"));
    // 关键：两个权限码不同 → 取消一个不会影响另一个
    expect(orderCreate.code).not.toBe(pageCreate.code);
    expect(orderCreate.key).not.toBe(pageCreate.key);

    const allKeys: string[] = [];
    (function walk(nodes: any[]) {
      for (const node of nodes) {
        allKeys.push(node.key);
        walk(node.children || []);
      }
    })(tree);
    expect(new Set(allKeys).size).toBe(allKeys.length);
    expect(keyMap[pageCreate.key]).toBe(scoped("data:create:TORDER0001", "r-page"));
  });

  it("系统功能按 group 做成二级树，且没有「表格数据」分组（读权限由菜单决定）", () => {
    const { tree } = build();
    const functionsGroup = tree.find((node) => node.title === "系统功能")!;
    const groupTitles = functionsGroup.children!.map((node) => node.title);

    expect(groupTitles).toContain("路由");
    expect(groupTitles).toContain("用户");
    expect(groupTitles).toContain("角色");
    expect(groupTitles).toContain("表格配置");
    expect(groupTitles).not.toContain("表格数据");

    const routeGroup = functionsGroup.children!.find((node) => node.title === "路由")!;
    expect(routeGroup.children!.map((node) => node.code)).toContain("route:read");
  });

  it("表格配置不存在时给出提示节点，不抛错", () => {
    const result = buildPermissionTree({
      routes: [{ id: "r-x", title: "孤儿菜单", type: "TABLE" as const, tcid: "TDELETED" }],
      tableConfigs: [],
    });
    const node = findNode(result.tree, "孤儿菜单");
    expect(node.children[0].disabled).toBe(true);
    expect(node.children[0].title).toContain("已不存在");
  });
});
