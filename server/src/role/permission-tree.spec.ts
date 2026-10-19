import {
  buildPermissionTree,
  menuPermissionCode,
  tableActionPermission,
  tableOperationPermission,
} from "./permission-tree";

/**
 * 权限树构建的单测。
 *
 * 这里把「哪些节点能勾、勾了写入什么权限码」的规则钉死，
 * 因为这块直接决定谁能看到哪个菜单、谁能点哪个按钮，改错就是安全问题了。
 */
describe("buildPermissionTree 权限树", () => {
  const routes = [
    { id: "r-home", title: "首页", type: "CUSTOM" as const, path: "/home", accessType: "PUBLIC", sort: 1 },
    { id: "r-order", title: "订单管理", type: "TABLE" as const, tcid: "TORDER", accessType: "ROLE", sort: 2 },
    {
      id: "r-order-detail",
      title: "订单详情",
      type: "CUSTOM" as const,
      parentId: "r-order",
      accessType: "ROLE",
      sort: 1,
    },
    { id: "r-open", title: "公开页面", type: "CUSTOM" as const, accessType: "PUBLIC", sort: 3 },
  ];

  const tableConfigs = [
    {
      tcid: "TORDER",
      name: "订单列表",
      operations: {
        create: true,
        update: true,
        delete: false,
        createPermission: "data:create:TORDER",
        updatePermission: "",
        deletePermission: "",
      },
      customActions: [
        { label: "标记发货", value: "ship", permission: "data:action:TORDER:ship" },
        { label: "查看详情", value: "detail" },
      ],
    },
  ];

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

  it("顶层包含「系统功能」和「菜单与按钮」两个分组", () => {
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

  it("表格路由下挂按钮权限：开启的操作才有节点，关闭的（删除）没有", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const buttonTitles = (order.children || []).map((node: any) => node.title);

    expect(buttonTitles).toContain("新增（订单列表）");
    expect(buttonTitles).toContain("修改（订单列表）");
    expect(buttonTitles).not.toContain("删除（订单列表）");
  });

  it("按钮权限码优先用配置里的，没配则用按 TCID 生成的默认码", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const children = order.children || [];

    const create = children.find((node: any) => node.title === "新增（订单列表）");
    const update = children.find((node: any) => node.title === "修改（订单列表）");

    expect(create.code).toBe("data:create:TORDER");
    expect(update.code).toBe(tableOperationPermission("TORDER", "update"));
  });

  it("自定义按钮：配了权限码的可勾选；没配的禁用并说明", () => {
    const { tree } = build();
    const order = findNode(tree, "订单管理");
    const children = order.children || [];

    const ship = children.find((node: any) => node.title === "标记发货（订单列表）");
    const detail = children.find((node: any) => node.title === "查看详情（订单列表）");

    expect(ship.code).toBe("data:action:TORDER:ship");
    expect(ship.disabled).toBeFalsy();

    expect(detail.disabled).toBe(true);
    expect(detail.note).toContain("未配置权限码");
    expect(detail.code).toBe(tableActionPermission("TORDER", "detail"));
  });

  it("keyMap 覆盖所有节点，且 key 全局唯一", () => {
    const { tree, keyMap } = build();
    const keys: string[] = [];

    function walk(nodes: any[]) {
      for (const node of nodes) {
        keys.push(node.key);
        walk(node.children || []);
      }
    }
    walk(tree);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toHaveProperty;
    for (const key of keys) expect(Object.prototype.hasOwnProperty.call(keyMap, key)).toBe(true);
  });

  it("同一个权限码出现在多个节点时，key 自动加后缀区分", () => {
    const routes2 = [
      { id: "r-a", title: "表A菜单", type: "TABLE" as const, tcid: "TA" },
      { id: "r-b", title: "表B菜单", type: "TABLE" as const, tcid: "TB" },
    ];
    const configs2 = [
      { tcid: "TA", name: "表A", operations: { create: true, createPermission: "data:create" }, customActions: [] },
      { tcid: "TB", name: "表B", operations: { create: true, createPermission: "data:create" }, customActions: [] },
    ];

    // functions 传空数组：只验证「菜单与按钮」部分，避免系统功能里的 data:create 混进来
    const result = buildPermissionTree({ routes: routes2, tableConfigs: configs2, functions: [] });
    const allKeys: string[] = [];
    (function walk(nodes: any[]) {
      for (const node of nodes) {
        allKeys.push(node.key);
        walk(node.children || []);
      }
    })(result.tree);

    expect(new Set(allKeys).size).toBe(allKeys.length);
    const codes = Object.values(result.keyMap).filter((code) => code === "data:create");
    expect(codes.length).toBe(2); // 两个节点指向同一个权限码，这是允许的
  });

  it("表格配置被删掉时给出提示节点，不抛错", () => {
    const routes2 = [{ id: "r-x", title: "孤儿菜单", type: "TABLE" as const, tcid: "TDELETED" }];
    const result = buildPermissionTree({ routes: routes2, tableConfigs: [] });
    const node = findNode(result.tree, "孤儿菜单");
    expect(node.children[0].disabled).toBe(true);
    expect(node.children[0].title).toContain("已不存在");
  });

  it("系统功能按 group 做成二级树（主系统/路由/用户/角色/字典/表格配置）", () => {
    const { tree } = build();

    const functionsGroup = tree.find((node) => node.title === "系统功能")!;
    const groupTitles = functionsGroup.children!.map((node) => node.title);

    expect(groupTitles).toContain("路由");
    expect(groupTitles).toContain("用户");
    expect(groupTitles).toContain("角色");
    expect(groupTitles).toContain("字典");
    expect(groupTitles).toContain("表格配置");

    // 「路由」分组下面才是真正的权限叶子节点
    const routeGroup = functionsGroup.children!.find((node) => node.title === "路由")!;
    expect(routeGroup.code).toBe("");
    expect(routeGroup.children!.map((node) => node.code)).toContain("route:read");
  });

  it("全局表格数据权限不再出现在系统功能里（避免和具体表格的按钮权限重复）", () => {
    const { tree } = build();

    const allCodes: string[] = [];
    (function walk(nodes: any[]) {
      for (const node of nodes) {
        if (node.code) allCodes.push(node.code);
        walk(node.children || []);
      }
    })(tree);

    // 这 4 个是需求 002 之前的全局码，现在只应该出现在「老表」的按钮节点上，
    // 不应该再作为系统功能的一项出现（本 fixture 的 TORDER 用的是 data:create:TORDER）
    expect(allCodes).not.toContain("data:read");
    expect(allCodes).not.toContain("data:create");
    expect(allCodes).not.toContain("data:update");
    expect(allCodes).not.toContain("data:delete");

    // 系统功能里也不应该再有「表格数据」这个分组
    const functionsGroup = tree.find((node) => node.title === "系统功能")!;
    expect(functionsGroup.children!.map((node) => node.title)).not.toContain("表格数据");
  });

  it("老表的全局权限码 / 重复权限码会给出说明（让「看起来重复」的节点自解释）", () => {
    const routes2 = [{ id: "r-old", title: "老表菜单", type: "TABLE" as const, tcid: "TOLD" }];
    const configs2 = [
      {
        tcid: "TOLD",
        name: "老表",
        operations: {
          create: true,
          createPermission: "data:create",
          update: true,
          updatePermission: "data:create",
          delete: false,
        },
        customActions: [],
      },
    ];

    const result = buildPermissionTree({ routes: routes2, tableConfigs: configs2, functions: [] });
    const node = findNode(result.tree, "老表菜单");
    const create = node.children.find((child: any) => child.title === "新增（老表）");
    const update = node.children.find((child: any) => child.title === "修改（老表）");

    expect(create.note).toContain("旧版全局权限码");
    expect(update.note).toContain("同一个权限码");
  });
});
