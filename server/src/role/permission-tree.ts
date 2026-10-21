import { ALL_PERMISSIONS } from "../common/constants";
import { viewAllPermissionCode } from "../common/data-scope";
import { routeScopedPermission } from "../common/permission-scope";
import { declaredTcids } from "../route/route-tcids";

/**
 * 角色权限树构建器（纯函数，不碰数据库）。
 *
 * 背景（需求 002 第 2 条）：
 *   路由原来让人手填 permissionCode，没人知道该填什么，意义不明确。
 *   现在改成：角色管理里展示一棵「菜单 + 按钮」的树，勾选即授权：
 *     - 菜单节点      → 权限码 `menu:<routeId>`
 *     - 表格按钮节点  → 权限码就是表格配置里配的那个权限码（默认 `data:create:<tcid>` 等）
 *   这样管理员看到的是「订单管理 / 新增 / 修改 / 删除」这种看得懂的东西，
 *   而不是一堆 `data:create` 字符串。
 *
 * 为什么抽成纯函数：
 *   树的结构和各种边界（公开菜单、按钮被关闭、自定义按钮没配权限码、老数据重复权限码）
 *   坑很多，纯函数才能写单测把规则钉死。
 */

/** 构建树需要的路由信息（只要用到的字段，方便单测造数据） */
export interface RouteLike {
  id: string;
  parentId?: string | null;
  title: string;
  type: "CUSTOM" | "TABLE";
  tcid?: string | null;
  sort?: number;
  accessType?: string;
  /**
   * CUSTOM 路由的 JSON 配置。自定义页面内嵌了哪些表写在 `config.tcids` 里，
   * 例如 { tcids: ["TDEMOORDERS"] }（见 route/route-tcids.ts）。
   */
  config?: any;
}

/** 构建树需要的表格配置信息 */
export interface TableConfigLike {
  tcid: string;
  name: string;
  operations?: any;
  customActions?: any;
  /** 读数据范围：只有 OWN 的表才需要「查看全部数据」这个逃生口 */
  readScope?: string | null;
}

/** 树节点 */
export interface PermissionTreeNode {
  /** el-tree 的 node-key，保证唯一（同一权限码可能出现在多个节点上） */
  key: string;
  /** 勾选后写入角色的权限码；分组节点为空字符串 */
  code: string;
  title: string;
  type: "group" | "function" | "menu" | "button";
  /** true = 不可勾选（比如公开菜单、被关闭的操作、没配权限码的自定义按钮） */
  disabled?: boolean;
  /** 给管理员看的说明 */
  note?: string;
  children?: PermissionTreeNode[];
}

export interface PermissionTreeResult {
  tree: PermissionTreeNode[];
  /** key → 权限码。前端保存时把 el-tree 的勾选 key 映射回权限码 */
  keyMap: Record<string, string>;
}

/** 菜单访问权限码：由路由 id 决定，稳定且不用手填 */
export function menuPermissionCode(routeId: string): string {
  return `menu:${routeId}`;
}

/** 表格增删改的默认权限码（按 TCID 隔离，不同表互不影响） */
export function tableOperationPermission(tcid: string, action: "look" | "create" | "update" | "delete"): string {
  return `data:${action}:${tcid}`;
}

/** 表格自定义按钮的默认权限码 */
export function tableActionPermission(tcid: string, value: string): string {
  return `data:action:${tcid}:${value}`;
}

const OPERATION_LABELS: Record<"look" | "create" | "update" | "delete", string> = {
  look: "查看详情",
  create: "新增",
  update: "修改",
  delete: "删除",
};

/**
 * 子系统（租户）角色可用的系统功能分组。
 *
 * 路由、字典、表格配置、子系统管理都属于「主系统超管维护」的配置能力，
 * 租户自己的角色只应管理「用户」和「角色」，否则租户管理员可以自己改配置甚至越权。
 */
export const TENANT_FUNCTION_GROUPS = ["用户", "角色"];

/**
 * 按系统类型过滤出可展示的系统功能权限。
 *
 * - 主系统：全部（「表格数据」组照旧剔除，读权限由菜单决定）
 * - 子系统：只有「用户」「角色」两组
 */
export function availableFunctions(isMainSystem: boolean): typeof ALL_PERMISSIONS {
  return ALL_PERMISSIONS.filter(
    (item) => item.group !== "表格数据" && (isMainSystem || TENANT_FUNCTION_GROUPS.includes(item.group)),
  );
}

/**
 * 构建整棵权限树。
 *
 * 返回两部分：
 *   tree   —— 给 el-tree 直接渲染
 *   keyMap —— key → 权限码（因为同一个权限码可能挂在多个节点上，key 必须唯一）
 */
export function buildPermissionTree(input: {
  routes: RouteLike[];
  tableConfigs: TableConfigLike[];
  functions?: Array<{ code: string; name: string; group: string }>;
}): PermissionTreeResult {
  const keyMap: Record<string, string> = {};
  const usedKeys = new Set<string>();

  /** 生成唯一 key，并把 key→code 记进映射 */
  function makeNode(node: Omit<PermissionTreeNode, "key"> & { keyBase: string }): PermissionTreeNode {
    let key = node.keyBase;
    let index = 2;
    while (usedKeys.has(key)) {
      key = `${node.keyBase}#${index}`;
      index += 1;
    }
    usedKeys.add(key);
    keyMap[key] = node.code;
    return {
      key,
      code: node.code,
      title: node.title,
      type: node.type,
      disabled: node.disabled,
      note: node.note,
      children: node.children,
    };
  }

  // ---------- 1. 系统功能（按 group 二级分组）----------
  //
  // 「表格数据」这一组（data:read / data:create / data:update / data:delete）整体不进树：
  //   1. 读取权限已经改成「勾了这张表对应的菜单即可读」（见 table-data/read-access.ts），
  //      不需要再单独勾一个「读取所有表格数据」的全局开关（用户明确反对这种设计）；
  //   2. 增删改属于按钮权限，由各表菜单下面的按钮节点提供（新表是 data:<op>:<tcid>）。
  // 老角色上已经存在的全局码不会丢：角色页保存时会把树上没有的码原样保留（legacyCodes）。
  const functions = (input.functions || availableFunctions(true)).filter((item) => item.group !== "表格数据");

  // group 名称 → 该组下的权限项
  const functionGroups = new Map<string, typeof functions>();
  for (const item of functions) {
    if (!functionGroups.has(item.group)) functionGroups.set(item.group, []);
    functionGroups.get(item.group)!.push(item);
  }

  const functionsNode = makeNode({
    keyBase: "group:functions",
    code: "",
    title: "系统功能",
    type: "group",
    children: [...functionGroups.entries()].map(([groupName, items]) => {
      // 把分组里的「查看」权限（`*:read`）嫁接到分组节点上：
      //   勾选「用户」= 拿到 user:read（能进入用户管理并查看列表），和「菜单与按钮」里
      //   「勾选菜单 = 能看到页面」保持一致。
      //   剩下的新增/修改/删除继续挂在下面，单独勾选（前端 check-strictly，父子不联动）。
      const readItem = items.find((item) => item.code.endsWith(":read"));
      if (readItem) {
        return makeNode({
          keyBase: `group:functions:${groupName}`,
          code: readItem.code,
          title: groupName,
          type: "function",
          note: `勾选后：能进入「${groupName}」并查看（${readItem.code}）`,
          children: items
            .filter((item) => item !== readItem)
            .map((item) =>
              makeNode({
                keyBase: `function:${item.code}`,
                code: item.code,
                title: `${item.name}（${item.code}）`,
                type: "function",
              }),
            ),
        });
      }

      // 没有 `:read` 的分组（比如「主系统」只有 system:manage）保持纯展示分组
      return makeNode({
        keyBase: `group:functions:${groupName}`,
        code: "",
        title: groupName,
        type: "group",
        children: items.map((item) =>
          makeNode({
            keyBase: `function:${item.code}`,
            code: item.code,
            title: `${item.name}（${item.code}）`,
            type: "function",
          }),
        ),
      });
    }),
  });

  // ---------- 2. 菜单与按钮 ----------
  const configByTcid = new Map<string, TableConfigLike>();
  for (const config of input.tableConfigs || []) configByTcid.set(config.tcid, config);

  // 按 parentId 建树；没有父节点的当顶级
  const childrenOf = new Map<string | null, RouteLike[]>();
  for (const route of input.routes || []) {
    const parentId = route.parentId || null;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(route);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.title.localeCompare(b.title));
  }

  // 把「一张表的增删改按钮 + 自定义按钮」挂到某个路由节点下面。
  //
  // 权限码按路由区分：`<基础码>:route:<routeId>`。
  // 同一张表被多条路由引用时（比如「订单管理」和引用它的「自定义页面示例」），
  // 各自生成独立权限码 —— 取消一条路由下的按钮不会影响另一条（用户明确要求）。
  // 前端 el-tree 用 check-strictly（父子不联动），按钮勾选不会影响菜单。
  const appendTableButtons = (target: PermissionTreeNode, tcid: string, routeId: string) => {
    const config = configByTcid.get(tcid);
    /** 把基础权限码转成当前路由的权限码（老数据的基础码仍然兼容，见 common/permission-scope.ts） */
    const scoped = (base: string) => routeScopedPermission(base, routeId) || base;

    if (!config) {
      target.children!.push(
        makeNode({
          keyBase: `menu:${routeId}:missing:${tcid}`,
          code: "",
          title: `表格配置 ${tcid} 已不存在`,
          type: "button",
          disabled: true,
        }),
      );
      return;
    }

    const operations = config.operations || {};
    // 这张表下已经出现过的权限码 → 第一次出现的节点标题。
    // 用来给「多个按钮共用一个权限码」的情况加说明，避免管理员以为权限重复了。
    const usedCodes = new Map<string, string>();

    /** 记录权限码，返回给节点用的说明（重复码 / 旧版全局码） */
    const noteForCode = (code: string, title: string, isGlobalLegacy: boolean): string | undefined => {
      const notes: string[] = [];
      if (isGlobalLegacy) notes.push("旧版全局权限码（该表创建于需求 002 之前），所有用这个码的表都会受影响");
      const previous = usedCodes.get(code);
      if (previous) notes.push(`与「${previous}」是同一个权限码，勾一个两个都会生效`);
      else usedCodes.set(code, title);
      return notes.length > 0 ? notes.join("；") : undefined;
    };

    for (const action of Object.keys(OPERATION_LABELS) as Array<keyof typeof OPERATION_LABELS>) {
      if (operations[action] === false) continue; // 该操作被关闭，不需要授权
      const base = operations[`${action}Permission`] || tableOperationPermission(tcid, action);
      const code = scoped(base);
      const title = `${OPERATION_LABELS[action]}（${config.name}）`;
      // 没有按 TCID 后缀的 data:look / data:create / data:update / data:delete 就是老数据的全局码
      const isGlobalLegacy = base === `data:${action}`;

      target.children!.push(
        makeNode({
          keyBase: `menu:${routeId}:button:${tcid}:${action}`,
          code,
          title,
          type: "button",
          note: noteForCode(code, title, isGlobalLegacy),
        }),
      );
    }

    // 读范围为「仅本人」时，额外给一个「查看全部数据」的逃生口：
    // 公告这类表常见「员工看自己、经理看全部」，不必为此改表配置。
    if (String(config.readScope || "ALL").toUpperCase() === "OWN") {
      const base = viewAllPermissionCode(tcid);
      const code = scoped(base);
      const title = `查看全部数据（${config.name}）`;
      target.children!.push(
        makeNode({
          keyBase: `menu:${routeId}:button:${tcid}:viewAll`,
          code,
          title,
          type: "button",
          note: "仅对读范围为「仅本人」的表格生效；勾选后能看到所有人创建的数据（含切换前没有创建人的历史数据）",
        }),
      );
    }

    for (const action of Array.isArray(config.customActions) ? config.customActions : []) {
      const label = String(action?.label || action?.value || "自定义按钮");
      const value = String(action?.value || "");
      if (!value) continue;

      const configuredCode = action?.permission ? String(action.permission) : "";
      const title = `${label}（${config.name}）`;
      const code = scoped(configuredCode || tableActionPermission(tcid, value));

      target.children!.push(
        makeNode({
          keyBase: `menu:${routeId}:action:${tcid}:${value}`,
          code,
          title,
          type: "button",
          // 没配权限码的自定义按钮当前是「所有人可见」，勾选也没有效果，所以禁掉并说明
          disabled: !configuredCode,
          note: configuredCode ? noteForCode(code, title, false) : "该按钮未配置权限码，当前所有人可见",
        }),
      );
    }
  };

  function buildRouteNode(route: RouteLike): PermissionTreeNode {
    const accessType = String(route.accessType || "PUBLIC").toUpperCase();
    const isRoleGated = accessType === "ROLE";
    const code = menuPermissionCode(route.id);

    // 菜单节点：勾了 = 能看到菜单（TABLE 菜单同时可读该表数据）。
    // 按钮挂在下面作为子节点；前端 el-tree 关闭了父子联动，所以按钮勾选不影响菜单。
    const note = isRoleGated
      ? route.type === "TABLE"
        ? "勾选后：能看到菜单，并可查询这张表的数据"
        : "勾选后：能看到这个页面"
      : "公开菜单（登录即可见，也可读该表数据）";

    const node: PermissionTreeNode = makeNode({
      keyBase: `menu:${route.id}`,
      code,
      title: route.title,
      type: "menu",
      // 公开菜单无需授权：显示出来但不可勾选，避免管理员误以为没生效
      disabled: !isRoleGated,
      note,
      children: [],
    });

    // 表格路由：把这张表的按钮权限挂到菜单下面
    if (route.type === "TABLE" && route.tcid) {
      appendTableButtons(node, route.tcid, route.id);
    }

    // 自定义页面：页面里声明了哪些表（config.tcids），就挂哪些表的按钮。
    // 同一个页面引用多张表时都会挂出来，各自独立勾选。
    if (route.type === "CUSTOM") {
      const embedded = declaredTcids(route.config);
      if (embedded.length > 0) {
        const names = embedded.map((tcid) => configByTcid.get(tcid)?.name || tcid);
        node.note = `${node.note}；页面内嵌表格：${names.join("、")}`;
        for (const tcid of embedded) appendTableButtons(node, tcid, route.id);
      }
    }

    // 子菜单（递归）
    for (const child of childrenOf.get(route.id) || []) {
      node.children!.push(buildRouteNode(child));
    }

    return node;
  }

  const menuNodes = (childrenOf.get(null) || []).map((route) => buildRouteNode(route));
  const menuGroup = makeNode({
    keyBase: "group:menus",
    code: "",
    title: "菜单与按钮",
    type: "group",
    note: "勾选 = 能看到这个菜单；菜单下面的按钮 = 能操作那张表（父子不联动）",
    children: menuNodes,
  });

  return { tree: [functionsNode, menuGroup], keyMap };
}
