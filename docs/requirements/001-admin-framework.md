# 需求 001：多租户「快速搭建后台」框架

> 这份文件是**需求原文的整理版**，用途是和你核对「我理解的 = 你想要的」。
> 每一行都对应实现位置，改需求请直接改这份文件，然后告诉我「按 docs/requirements/001 改」。
>
> - 提出时间：本项目启动时
> - 交付状态：见最后一节「实现对照」

---

## 1. 原始需求（整理）

### 1.1 工程形态

1. 在 `BackendManagementFramework/` 下新建系统，**前端 + 后端**都要。
2. 前端：Vue3 + Vite，UI 组件用 Element Plus（需求里写作 "element-ui-plus"，即 Element UI 的 Vue3 版本 `element-plus`）。
3. 后端：NestJS + Prisma + **pgvector**。
4. 前端、后端各自要有一份 md：**具体做了什么 + 启动命令 + 注意事项**。
5. 系统建好后，把设计文档骨架 (`docs/` + `AGENTS.md`) 放进根目录。
6. 根目录还要有一份 md：**发布方式 + 注意事项**，详细程度参照 `jisu-ai-customer/DEPLOY.md`。
7. 一共 **3 个 md**：根目录一个、前端一个、后端一个。

### 1.2 业务需求

| #   | 需求                                               | 说明                                                              |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| B1  | 管理后台管理系统框架                               | 主系统 = 配置中心                                                 |
| B2  | 主系统只有超管一个账号                             | `yy1 / yy1129273677`                                              |
| B3  | 超管登录后可以新建子系统                           | 可建多个，用「租户 id + 系统 id」区分；子系统是给最终用户用的系统 |
| B4  | 用主系统快速为子系统新建路由、用户、角色、业务字典 | 全部在后台点，不用改代码                                          |
| B5  | 路由可以是「自定义开发页面」                       | 配置前端 js 路径即可                                              |
| B6  | 路由可以是「表格」                                 | 也需配置前端 js；包含搜索条件、表格、分页、增删改                 |
| B7  | 表格字段 = 数据库字段                              | 可以新增字段                                                      |
| B8  | 每个字段可设置                                     | 是否在表格中显示、是否可搜索                                      |
| B9  | 搜索可设置常见形式                                 | 例如「并且」；也可自定义语句                                      |
| B10 | 配置完表格生成 **TCID**                            | TCID 代表这张表的配置文件，配置文件入库                           |
| B11 | 可设置操作列增删改的权限                           | 按权限控制能看到/能点哪些操作                                     |
| B12 | 可加自定义操作按钮                                 | 设置 `label`（显示文字）和 `value`（标识）                        |
| B13 | 前端开发自定义按钮的方式                           | 引入公用组件 `table`，用插槽开发                                  |
| B14 | 表格路由的渲染方式                                 | 页面引入 `<table>` 传 TCID → 组件按 TCID 取配置 → 渲染            |
| B15 | 自定义表格/按钮的实现                              | 通过 slot 匹配配置里的 `value`                                    |
| B16 | 目标                                               | 快速为用户搭建后台管理系统                                        |

---

## 2. 需要特别说明的三处「我的判断」

需求里有三处如果照字面实现会有隐患，我做了取舍，**这几条最需要你确认**：

### 2.1 「搜索可自定义语句」→ 结构化条件组，不是原始 SQL

- **字面理解**：超管在页面上填一段 WHERE 语句（如 `amount > 100 AND status = 'paid'`）。
- **实际问题**：等于把 SQL 注入的钥匙交给超管；而且慢查询上线没人拦得住。
- **实现方式**：结构化条件组，支持任意 AND/OR/NOT 嵌套，表达能力等价：

```json
{
  "mode": "CUSTOM",
  "group": {
    "logic": "OR",
    "conditions": [
      { "field": "status", "op": "in", "value": ["paid", "shipped"] },
      { "field": "amount", "op": "gt", "value": 1000 }
    ]
  }
}
```

详见 `server/src/table-data/search-builder.ts` 与 `docs/adr/0001`。
**如果你确实需要开放原始 SQL，告诉我，我加一个只对超管可见的「高级模式」开关（并加审计日志）。**

### 2.2 「表格字段即为数据库字段」→ 真的建物理表

- **实现**：一张 TCID 对应一张 `biz_<tcid>` 真实表；加字段执行 `ALTER TABLE ADD COLUMN`。
- **取舍**：符合需求描述、能直接用 SQL 查报表；代价是 DDL 有风险（已用白名单校验 + 只做加法约束）。
- 备选方案（单表 + JSONB）在 ADR 里对比过。

### 2.3 「自定义页面配置前端 js 路径」→ 构建期 vue 文件路径

- **实现**：`componentPath` 填相对 `client/src/views` 的 `.vue` 文件路径（如 `business/examples/demo-table.vue`），
  前端用 `import.meta.glob` 在构建期建立映射。
- **代价**：新增页面要重新构建/发版；换来的是类型安全、无运行时信任问题。
- 备选（运行时动态加载外部 JS 文件）需要处理信任/沙箱/版本，暂不做。

---

## 3. 实现对照

| #   | 需求点                                    | 状态                    | 证据                                                                                 |
| --- | ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ | ---- | ---- | -------------------- |
| 1.1 | 前后端都在 `BackendManagementFramework/`  | ✅                      | `client/`、`server/`                                                                 |
| 1.2 | Vue3 + Vite + Element Plus                | ✅                      | `client/package.json`                                                                |
| 1.3 | NestJS + Prisma + pgvector                | ✅                      | `server/package.json`、`prisma/schema.prisma`、迁移 SQL 的 `CREATE EXTENSION vector` |
| 1.4 | 前后端各一份说明 md（做了什么/启动/注意） | ✅                      | `client/README.md`、`server/README.md`                                               |
| 1.5 | 设计文档骨架进根目录                      | ✅                      | `AGENTS.md`、`docs/**`                                                               |
| 1.6 | 根目录部署 md（参照 jisu 的 DEPLOY.md）   | ✅                      | `DEPLOY.md`                                                                          |
| 1.7 | 一共 3 个运维 md                          | ✅                      | `DEPLOY.md` + `client/README.md` + `server/README.md`                                |
| B2  | 超管 `yy1 / yy1129273677`                 | ✅                      | `server/prisma/seed.ts`（可用环境变量覆盖）                                          |
| B3  | 可建多个子系统，按租户/系统隔离           | ✅                      | `sys_system` + 所有业务表 `system_id`；`server/src/system/`                          |
| B4  | 后台建路由/用户/角色/字典                 | ✅                      | `server/src/route                                                                    | user | role | dict/`、前端对应页面 |
| B5  | 路由 = 自定义页面（配 js 路径）           | ✅                      | `sys_route.component_path`，前端 `import.meta.glob`                                  |
| B6  | 路由 = 表格（搜索/表格/分页/增删改）      | ✅                      | `table-config` + `table-data` 模块、`components/table/index.vue`                     |
| B7  | 字段 = 数据库字段、可新增                 | ✅                      | `ddl.service.ts` 的 `createTable` / `addColumns`                                     |
| B8  | 字段可设显示/可搜索                       | ✅                      | `fields[].visible` / `searchable`                                                    |
| B9  | 搜索形式可配（并且/自定义）               | ✅（自定义=结构化 DSL） | `search_mode`、`search-builder.ts`                                                   |
| B10 | 生成 TCID、配置入库                       | ✅                      | `tcid.generator.ts`、`sys_table_config`                                              |
| B11 | 操作列增删改权限                          | ✅                      | `operations` JSON + 后端双层权限校验                                                 |
| B12 | 自定义按钮 label + value                  | ✅                      | `custom_actions`、表格配置设计器页面                                                 |
| B13 | 自定义按钮用公用组件 + 插槽               | ✅                      | `#action-<value>`，示例 `views/business/examples/demo-table.vue`                     |
| B14 | `<table :tcid>` 渲染整张表                | ✅                      | `client/src/components/table/index.vue`                                              |
| B15 | slot 匹配配置里的 value                   | ✅                      | `resolveActionSlotName()`、`utils.spec.ts`                                           |
| B16 | 目标是快速搭建后台                        | ✅                      | 四步流程见 `docs/design/03-flows.md`                                                 |

---

## 4. 明确不做的事（非目标）

| 不做                          | 原因                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| 删除字段时同步 DROP 列        | 会丢数据，需要人工确认                                      |
| 改字段类型                    | 需要重写整张表，风险高                                      |
| 开放原始 SQL 给用户           | 注入风险，改用结构化 DSL                                    |
| 接入 embedding 模型做语义检索 | pgvector 只做**预留**（建库建表），需要另外的模型与成本决策 |
| 文件上传、消息队列、定时任务  | 不在本次需求范围                                            |
| 前端按需引入 / 分包优化       | 全量引入 Element Plus，优先开发效率                         |
