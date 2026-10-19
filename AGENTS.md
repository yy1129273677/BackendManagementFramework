# AGENTS.md —— 给 AI 协作者（和未来的你）的项目约定

> 这个文件是「项目说明书」，目的是让任何接手的人（人或 AI）在**读代码之前**就知道：
> 技术栈是什么、命令怎么跑、哪些词是什么意思、哪些东西绝对不能动。

---

## 1. 这是什么项目

**一个「配置驱动」的多租户后台管理系统框架。**

- **主系统**：只有超管一个账号，作用是配置中心——建子系统、配表格（生成 TCID）、配路由、配用户/角色/字典
- **子系统**：真正给客户用的后台，可建多个，靠「系统编码 + 租户 id」隔离
- **核心机制**：在后台配一张表 → 拿到 TCID → 前端 `<Table :tcid="TCID" />` 一行渲染整张表

一句话目标：**把「做一个后台页面」的成本从「写代码 + 发版」降到「在后台点几下」。**

---

## 2. 技术栈（不要擅自替换）

| 端 | 技术 | 位置 |
|---|---|---|
| 前端 | Vue 3 + Vite 5 + Element Plus + Pinia + vue-router（hash）+ axios | `client/` |
| 后端 | NestJS 11 + Prisma 6 + PostgreSQL 16 + pgvector | `server/` |
| 认证 | JWT（Bearer token），bcrypt 存密码 | `server/src/auth/` |
| 测试 | 后端 jest（`--runInBand`）、前端 vitest | 各自 `*.spec.ts` |
| 部署 | Docker Compose（db + server + web/Nginx） | 根目录 |

**不引入**：大型 UI 框架替代 Element Plus、ORM 替代 Prisma、状态管理替代 Pinia、
monorepo 工具链（pnpm workspace 之类）。当前是「两个独立 npm 包」，不是 workspace。

---

## 3. 命令速查

```bash
# ---------- 本地起数据库（根目录）----------
cp .env.example .env             # 首次要复制一份（里面是本地默认值）
docker compose up -d db          # 宿主机端口 5434

# ---------- 后端 ----------
cd server
cp .env.example .env
npm install
npx prisma migrate deploy        # 建表
npm run seed                     # 造超管 + demo 数据
npm run start:dev                # 开发，端口 3000
npm test                         # 47 个单测，不需要数据库
npm run build                    # prisma generate + nest build

# ---------- 前端 ----------
cd client
npm install
npm run dev                      # 端口 5173，/api 代理到 3000
npm test                         # 18 个单测
npm run build                    # 产物 dist/
```

默认账号（`npm run seed` 之后）：
- 超管：`yy1 / yy1129273677`，系统编码留空
- 演示：`demo / demo123456`，系统编码 `demo`
- 示例表格 TCID：`TDEMOORDERS`

---

## 4. 术语表（看代码前先对齐）

| 术语 | 含义 |
|---|---|
| 主系统 | `sys_system.code = 'main'`，超管专用，配置中心 |
| 子系统 / 租户 | 客户使用的独立后台，`sys_system` 一行 |
| 系统编码 | 子系统的 `code`，登录时要填，创建后不可改 |
| **TCID** | 表格配置编号（`T` + 10 位），前端靠它取配置 |
| 表格配置 | `sys_table_config` 一行 = 一张可渲染的表 |
| 物理表 | `biz_<tcid 小写>`，真实存业务数据的表 |
| 路由 / 菜单 | `sys_route`，`type=TABLE` 绑 TCID，`type=CUSTOM` 绑 vue 文件路径 |
| 自定义页面 | 手写 vue 文件，路径相对 `client/src/views` |
| 表格页面 | 由 TCID 配置自动渲染的页面 |
| 业务字典 | `sys_dict_type/item`，下拉选项存在库里 |
| 自定义按钮 value | 按钮的机器标识，前端用 `#action-<value>` 接管点击 |
| 权限码 | 形如 `data:create`，角色持有，后端守卫校验 |
| 超管 | 主系统里角色编码为 `SUPER_ADMIN` 的账号，权限为 `["*"]` |

---

## 5. 硬性规则（违反会出安全事故或数据事故）

1. **不要放宽 `server/src/common/identifiers.ts` 的校验**
   它是全系统唯一把用户输入拼进 SQL 文本的地方（表名/列名无法参数化，这是 PostgreSQL 的限制）。
   改之前先看 `identifiers.spec.ts` 里的注入用例。

2. **不要把数据值拼进 SQL**
   值一律用 Prisma 参数化（`Prisma.sql` / `${value}`）。只有**经过校验的标识符**能用 `Prisma.raw`。

3. **不要开放「原始 SQL WHERE」给用户**
   需求里的"自定义语句"已经实现为结构化条件组（`server/src/table-data/search-builder.ts`）。
   它表达能力和手写 WHERE 等价，但没有注入面。要改先看 ADR 0001。

4. **DDL 只做加法**
   加字段 = `ADD COLUMN`；删字段只从配置移除（物理列保留）；改类型直接拒绝。
   任何「DROP / ALTER TYPE」都必须人工执行并留记录。

5. **不要用 `prisma migrate dev`**
   会连库并可能重置数据。新增迁移用离线命令：
   `npm run prisma:migrate:diff > prisma/migrations/000X_名字/migration.sql`，然后人工检查。

6. **后端单测不能连数据库**
   一旦依赖真库，`npm test` 就会在 CI 和新机器上红。测试只测纯函数/规则。

7. **多租户查询必须带 `systemId`**
   任何 `findMany/findFirst` 漏了 `systemId` 就是跨租户数据泄露。
   新增接口时先想清楚：它属于哪个子系统？

8. **权限判断必须放在后端**
   前端隐藏按钮只是体验。新接口需要权限就加 `@RequirePermissions('xxx')`，
   并同步 `ALL_PERMISSIONS`（后端 constants.ts + 前端 permissions.ts + docs/design/05-rules.md）。

---

## 6. 常见改动怎么做

### 加一个权限码
1. `server/src/common/constants.ts` → `ALL_PERMISSIONS` 加一行
2. `client/src/constants/permissions.ts` 同步（角色编辑页兜底用）
3. 接口上加 `@RequirePermissions('新权限码')`
4. `docs/design/05-rules.md` 的权限矩阵补一行
5. `server/src/common/permissions.spec.ts` 如有新规则补测试

### 加一种字段类型
1. `server/src/table-config/table-field.types.ts`：`FieldType` 联合类型 + `SQL_TYPE_MAP` + `defaultSearchOp`
2. `server/src/table-data/table-data.service.ts`：`normalizeValue` 里的类型转换
3. `client/src/components/table/index.vue`：搜索控件 + 表单控件（两个 `v-else-if` 分支）
4. `client/src/views/table-config/index.vue`：`FIELD_TYPES` 下拉加一项
5. `docs/design/05-rules.md` 的类型映射表补一行

### 加一种路由类型
1. `prisma/schema.prisma` 的 `RouteType` 枚举加值 → 生成迁移
2. `server/src/route/route.service.ts` 的 `normalize` 分支
3. `client/src/router/index.ts` 的 `setupDynamicRoutes` 分支
4. `docs/design/03-flows.md`、`02-domain.md` 补说明

### 写一个自定义业务页面（最常见）
1. 复制 `client/src/views/examples/demo-table.vue`
2. 改 TCID，删掉用不到的插槽
3. 在「路由管理」里建一条 `CUSTOM` 路由，`componentPath` 填相对 `src/views` 的路径
4. 刷新页面，菜单出现

---

## 7. 文档在哪

```
DEPLOY.md                 # 部署手册（服务器、Docker、更新、备份、坑）
client/README.md          # 前端：做了什么、启动命令、Table 组件 API、注意事项
server/README.md          # 后端：做了什么、API 一览、启动命令、注意事项
docs/
├── README.md             # 文档索引
├── glossary.md           # 术语表
├── requirements/         # 需求（人写的、可核对的）
├── design/               # 设计（01 背景 … 06 失败模式）
└── adr/                  # 架构决策记录
```

**三个运维 md 的分工**：根 `DEPLOY.md` 讲部署，两个子目录 README 讲各自怎么跑和注意什么。
新增/修改文档时保持这个分工，不要把部署命令散落到各处。
