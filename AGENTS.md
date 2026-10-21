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

| 端   | 技术                                                                        | 位置               |
| ---- | --------------------------------------------------------------------------- | ------------------ |
| 前端 | Vue 3 + Vite 5 + Element Plus + Pinia + vue-router（hash）+ axios + ECharts | `client/`          |
| 后端 | NestJS 11 + Prisma 6 + PostgreSQL 16 + pgvector                             | `server/`          |
| 认证 | JWT（Bearer token），bcrypt 存密码                                          | `server/src/auth/` |
| 测试 | 后端 jest（`--runInBand`）、前端 vitest                                     | 各自 `*.spec.ts`   |
| 部署 | Docker Compose（db + server + web/Nginx）                                   | 根目录             |

**不引入**：大型 UI 框架替代 Element Plus、ORM 替代 Prisma、状态管理替代 Pinia、
monorepo 工具链（pnpm workspace 之类）。当前是「两个独立 npm 包」，不是 workspace。
除根目录的 `.prettierrc.json` / `.editorconfig` 之外，不引入 ESLint 之类的 lint 链。

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
npm test                         # 138 个单测，不需要数据库
npm run build                    # prisma generate + nest build
npm run migrate:002:dry          # 权限码迁移预览（老表全局码 → 按 TCID，幂等）
npm run migrate:002              # 执行迁移（单事务，失败回滚）

# ---------- 前端 ----------
cd client
npm install
npm run dev                      # 端口 5173，/api 代理到 3000
npm run typecheck                # vue-tsc 类型检查（build 前会自动跑）
npm test                         # 18 个单测
npm run build                    # vue-tsc + vite build → dist/
```

> ⚠️ 前端的 `vite build` **不做类型检查**（esbuild 只转译），所以 `npm run build` 里
> 强制先跑 `vue-tsc --noEmit`。改完前端代码先跑 `npm run typecheck` 再提交。
> 本项目目前**没有 ESLint**（只有类型检查 + 单测）；要加 lint 需要先讨论规则集。

默认账号（`npm run seed` 之后）：

- 超管：`yy1 / yy1129273677`，系统编码留空
- 演示：`demo / demo123456`，系统编码 `demo`
- 示例表格 TCID：`TDEMOORDERS`

---

## 4. 术语表（看代码前先对齐）

| 术语             | 含义                                                             |
| ---------------- | ---------------------------------------------------------------- |
| 主系统           | `sys_system.code = 'main'`，超管专用，配置中心                   |
| 子系统 / 租户    | 客户使用的独立后台，`sys_system` 一行                            |
| 系统编码         | 子系统的 `code`，登录时要填，创建后不可改                        |
| **TCID**         | 表格配置编号（`T` + 10 位），前端靠它取配置                      |
| 表格配置         | `sys_table_config` 一行 = 一张可渲染的表                         |
| 物理表           | `biz_<tcid 小写>`，真实存业务数据的表                            |
| 路由 / 菜单      | `sys_route`，`type=TABLE` 绑 TCID，`type=CUSTOM` 绑 vue 文件路径 |
| 自定义页面       | 手写 vue 文件，路径相对 `client/src/views`                       |
| 表格页面         | 由 TCID 配置自动渲染的页面                                       |
| 业务字典         | `sys_dict_type/item`，下拉选项存在库里                           |
| 自定义按钮 value | 按钮的机器标识，前端用 `#action-<value>` 接管点击                |
| 权限码           | 形如 `data:create`，角色持有，后端守卫校验                       |
| 超管             | 主系统里角色编码为 `SUPER_ADMIN` 的账号，权限为 `["*"]`          |

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
4. `client/src/views/base/table-config/index.vue`：`FIELD_TYPES` 下拉加一项
5. `docs/design/05-rules.md` 的类型映射表补一行

### 加一种路由类型

1. `prisma/schema.prisma` 的 `RouteType` 枚举加值 → 生成迁移
2. `server/src/route/route.service.ts` 的 `normalize` 分支
3. `client/src/router/index.ts` 的 `setupDynamicRoutes` 分支
4. `docs/design/03-flows.md`、`02-domain.md` 补说明

### 写一个自定义业务页面（最常见）

1. 复制 `client/src/views/business/examples/demo-table.vue`
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
├── design/               # 设计（01 背景 … 06 失败模式、07 安全基线）
└── adr/                  # 架构决策记录
```

**三个运维 md 的分工**：根 `DEPLOY.md` 讲部署，两个子目录 README 讲各自怎么跑和注意什么。
新增/修改文档时保持这个分工，不要把部署命令散落到各处。

---

## 8. 代码风格（硬约束）

**这一节是给"以后怎么写代码"定的规矩，不是建议。**

1. **风格由根目录的 `.prettierrc.json` 唯一定义**，以 Prettier 3.7.4 默认值为基准，
   其中 printWidth 调整为 120（Prettier 默认是 80）：
   **缩进 2 空格**（不是 4 空格）、不用 Tab、加分号、用双引号、每行最多 120 列、
   尾逗号 `all`、箭头函数单参数也带括号、Vue 的 script/style 不额外缩进、行尾用 LF。
   想改风格就改这个文件，不要在代码里各写各的。

2. **Trae / VSCode 是按这套值在格式化你的**：`formatOnSave = true` + 扩展
   `esbenp.prettier-vscode`（内置 Prettier 3.7.4）。所以你写完按一下 Ctrl+S 就会重排。
   为避免"提交时又被重排一遍"，**新增或改动的代码先格式化再提交**。

3. **命令**（在仓库根目录跑，`npm install` 只需一次）：

   ```bash
   npm install          # 装根目录的开发期工具
   npm run format       # 把整个仓库格式化成上面那套风格
   npm run format:check # 只检查不改，红了就说明有文件没格式化
   ```

4. **根目录的 `package.json` 只是开发期工具**，只装 Prettier，不进 Docker 镜像，
   也不装任何业务依赖。`client/` 和 `server/` 各自还是独立的 npm 包，不要动。

5. **SFC 块顺序是硬约束：`<template>` → `<script setup>` → `<style>`**。
   新写/改写的组件不许把 script 放前面。理由：先看结构再看逻辑，和项目现有 16 个组件保持一致。
   检查命令（在 `client/` 下）：

   ```powershell
   Get-ChildItem -Recurse -File -Filter *.vue src | ForEach-Object {
     $l = Get-Content $_.FullName
     $t = ($l | Select-String '^<template' | Select-Object -First 1).LineNumber
     $s = ($l | Select-String '^<script'   | Select-Object -First 1).LineNumber
     if ($t -gt $s) { "顺序不对: " + $_.Name }
   }
   ```

6. **样式一律用 Less**：`<style lang="less" scoped>`（`less` 已作为 devDependency 装上）。
   颜色 / 圆角 / 阴影等共用值统一放 `client/src/styles/variables.less`，
   组件里 `@import "../styles/variables.less";` 之后用变量（`@primary`、`@border-light`…），
   不要在组件里写死十六进制。全局样式文件是 `client/src/styles/index.less`。

> `.prettierignore` 里排除的是 Prettier 解析不了或本来就不该动的东西
> （`node_modules`、`dist`、锁文件、`*.sql`、`*.ps1`、`nginx.conf`、Docker 相关文件）；
> `.editorconfig` 让别的编辑器（IDEA / WebStorm）也用同一套基础格式。

---

## 9. 需求 002 之后的约定（重要）

1. **权限码是动态的，且表格按钮权限「按路由区分」**：
   `menu:<routeId>`、`data:create:<tcid>`（老的基础码）、
   **`data:create:<tcid>:route:<routeId>`（权限树生成的新格式）**。
   同一张表被多条路由引用时，每条路由生成独立权限码，取消一条路由下的按钮不影响另一条。
   前端请求拦截器会把当前动态路由 id 放进 `X-Route-Id` 请求头，
   后端用 `server/src/common/permission-scope.ts`（纯函数 + 单测）判断：
   认 `:route:<routeId>` 后缀，也兼容老的基础码（表示所有路由通用）。
   **不要再用「`ALL_PERMISSIONS` 固定白名单」过滤角色权限**——踩过坑：新权限码被静默丢掉，
   表现为"勾了权限却不生效"。角色权限只做格式校验（`role.service.normalizePermissions`）。

2. **权限实时生效，不要依赖 token 快照**：token 只证明身份；`JwtStrategy.validate`
   每次请求按 `user.sub` 查库（`auth/jwt-user.ts` 纯函数 + 单测）算出最新权限。
   所以**改完角色权限，用户刷新页面（F5）就能看到新菜单/按钮，不需要重新登录**；
   这是用户明确要求的行为，别再退回「权限快照」。

3. **读权限 = 勾了菜单就能读，没有单独的全局读开关**：
   表格数据接口（`/table/:tcid/config`、`/table/:tcid/data`）的读权限由
   `server/src/table-data/read-access.ts`（纯函数 + 单测）判断：
   超管 / 命中该表菜单（`menu:<routeId>` 或公开菜单）即可读；
   老角色残留的全局 `data:read` 仍然兼容放行。
   所以权限树里**没有「表格数据」分组**，不要再加回来。

4. **权限树是唯一录入入口**：新增菜单/按钮权限节点要改
   `server/src/role/permission-tree.ts`，并补 `permission-tree.spec.ts`；
   前端角色页直接用后端返回的 `{tree, keyMap}`，不要自己拼权限码。
   树的结构（两组）：
   - **系统功能**：按 `ALL_PERMISSIONS.group` 二级分组（表格数据组除外）
   - **菜单与按钮**：菜单节点；TABLE 菜单下面挂这张表的按钮，
     CUSTOM 页面按 JSON 配置里的 `tcids` 挂对应表的按钮。
     **按钮权限码 = `<基础码>:route:<routeId>`**（每条路由独立，见第 1 条）。
     角色页 el-tree **必须开 `check-strictly`（父子不联动）**：
     这样勾/取消某个按钮只影响该按钮本身，不会把父菜单变成半选、也不会丢菜单权限。
     保存时除了 `getCheckedKeys()` 还带上 `getHalfCheckedKeys()`（防御性，见 `role/index.vue`）。
     菜单可见性规则在 `server/src/route/route-visibility.ts`（有单测）：
     `ROLE` 路由只看 `menu:<routeId>`，**别再校验老字段 `permissionCode`**（已踩坑）。

4.1 **自定义页面里嵌表格（需求 004）**：CUSTOM 路由的页面里写了 `<Table :tcid="...">`（可以多个）时，
要在该路由的 JSON 配置里声明用了哪些表：`{"tcids": ["TDEMOORDERS"]}`。
读权限按「勾了这个页面菜单」放行，页面节点说明里会注明「页面内嵌表格：xxx」，
页面节点下面会挂这些表的增删改按钮（可单独勾）。
校验/解析在 `server/src/route/route-tcids.ts`（纯函数 + 单测；保存路由时校验格式和 TCID 归属）。
**改了页面里的 `<Table :tcid>` 要同步改路由的 `tcids` 配置**（前端路由弹窗有「插入 tcids 模板」按钮）。
不要再引入「扫描源码生成映射」那套（已按用户要求移除，见 docs/requirements/004）。

5. **老数据迁移用脚本，不用 SQL 硬改**：全局 `data:create/update/delete` → `data:<op>:<tcid>`
   的迁移逻辑在 `server/src/role/permission-migration.ts`（纯函数 + 单测），
   入口 `npm run migrate:002[:dry]`（幂等、dry-run、单事务）。改迁移规则要同步补单测，
   并且**新数据一律走新格式**（`normalizeFields` / `defaultOperationsForTcid`），别再产生全局码。

6. **路由 `config` 只注入 CUSTOM 页面**（`props.routeConfig`），表格页面不注入。
   注入逻辑在 `client/src/router/index.ts` 的 `setupDynamicRoutes`。

7. **表格字段的表单属性**：`listSort / searchSort / formSort / formVisible / formSpan / rules`，
   后端 `normalizeFields` 负责默认值和校准（`formSpan` 限制 1~24、正则必须能编译），
   前端 `<Table>` 负责按它排序、24 栅格布局、校验。

8. **校验规则只存「正则字符串 + 校验器名字」**，**禁止把 JS 代码存数据库执行**；
   自定义校验函数写在 `client/src/components/table/validators.ts`，用 `registerValidator` 注册。

9. **表格的「界面配置」存 `sys_table_config.config`（可空 JSON）**：
   目前只有 `table.height`、`form.dialog.width / height` 三个键，单位像素；
   后端 `normalizeTableUiConfig` 负责校验（**不认识的 key 一律报错**，防止把 height 拼错后静默失效），
   前端默认值在 `client/src/components/table/types.ts` 的 `DEFAULT_TABLE_UI_CONFIG`。
   **`config` 允许为空**（表示"没配过"，前端用内置默认值兜底），
   所以以后往这段 JSON 里加新键不用给老数据做迁移；键的优先级是
   `组件 prop > 后台配置 > 内置默认`。

10. **需求文档流程**：需求先出「整理版」（`docs/requirements/00X-...-整理版.md`，含我的判断与待确认点），
    确认后再开发、回填实现对照，并删掉原始需求文件。

---

## 10. 新增接口时的 Swagger 规范（必须遵守）

> 为什么定这个：Swagger 只认**声明式元数据**，不认 TypeScript 类型（编译后类型会被擦除）。
> 不写装饰器，文档里就只剩接口路径，请求体显示成 `{}`——等于没有文档。

1. **controller 层**
   - 类上必须有 `@ApiTags("中文分组")`。
   - 需要登录的加 `@ApiBearerAuth()`；公开接口（如健康检查）不写，并在方法上加 `@Public()`。
   - 用到 `X-System-Code` / `X-Route-Id` 这类自定义请求头时，用 `@ApiHeader` 说明用途和示例。
2. **每个路由方法必须有 `@ApiOperation({ summary })`**
   - `summary` 用一句中文说清"这个接口干什么"，不要写"接口1"这种废话。
   - 有副作用、权限要求、状态机限制、返回值特殊含义时，补 `description`。
3. **路径参数 / query 参数**
   - 路径参数用 `@ApiParam({ name, description, example })`。
   - query 参数用 `@ApiQuery({ name, required, description, example })`，`required` 要和 `@Query` 的实际可选性一致。
4. **请求体必须是 DTO 类**
   - 每个字段加 `@ApiProperty` / `@ApiPropertyOptional`（TS 里带 `?` 的用 Optional）。
   - `description` 写中文业务含义和约束；`example` 必须是**真实可用**的值，禁止 `"string"` 这类占位。
   - 有取值范围的补 `enum` / `format` / `minLength` / `maximum` 等（只在源码确实校验了该约束时才写）。
   - 字段语义复杂的（对象数组），用 `type: Object` + `description` 写清结构，**不要为了文档新建 DTO 类**。
5. **无法静态建模的接口**（如表格数据的动态字段）
   - 允许 `Record<string, any>`，不新建 DTO；但必须在 `@ApiOperation.description` 里写清字段规则
     （例如：只写入配置里 `editable` 的字段、`required` 为空返回 400）。
6. **禁止**：只加 `@ApiTags` 就完事；`summary` 用英文或重复方法名；文档描述和实际校验逻辑不一致。
7. **自检命令**（在 `server/` 下）：`npx tsc --noEmit -p tsconfig.json`。
8. **参考实现**：`server/src/auth/auth.dto.ts`、`server/src/auth/auth.controller.ts`、
   `server/src/table-data/table-data.controller.ts`、`server/src/table-config/table-config.dto.ts`。

---

## 11. 后端安全基线（必须遵守）

> 完整版见 [`docs/design/07-security.md`](docs/design/07-security.md)（含现状盘点、缺失项和工具链建议）。
> 下面只列**写代码时必须过的硬性项**。

1. **认证**：全局已注册 `JwtAuthGuard → SystemContextGuard → PermissionsGuard`，
   新增接口默认受保护。**唯一的放行方式是显式 `@Public()`**，且必须在 `@ApiOperation.summary` 里标注"公开接口"。
2. **授权**：特权操作加 `@RequirePermissions("权限码")`，并同步后端 `ALL_PERMISSIONS`、前端 `permissions.ts`、
   `docs/design/05-rules.md` 权限矩阵（见 §6）。
3. **多租户**：任何查询必须带 `systemId`（见 §5 第 7 条），漏了就是跨租户泄露。
4. **输入校验**
   - 静态结构的接口必须用 DTO 类，禁止用 `any` 接 `@Body()`。
   - 动态表格接口允许 `Record<string, any>`，但**必须**经 `editable` 白名单过滤 + 类型转换，
     不能把 body 原样拼进 SQL。
   - **不要照着通用模板把 `ValidationPipe` 改成 `whitelist: true, forbidNonWhitelisted: true`**：
     本项目 DTO 没用 `class-validator` 装饰器，开了会把所有字段剥光；`table-data` 的动态 body 还会被直接 400。
     真要改，必须先给全部 DTO 补校验装饰器，并单独评估动态表格接口。
5. **响应字段**：Prisma 查询必须显式 `select`（或手工组装白名单），
   禁止原样返回 Prisma model；禁止返回 `passwordHash`、`password`、`token`、`secret`、`DATABASE_URL`
   以及任何环境变量/连接串。
6. **SQL**：值一律参数化；表名/列名必须过 `common/identifiers.ts`；禁止把用户输入拼进 SQL 文本（见 §5）。
7. **限流**：已接入 `@nestjs/throttler`。全局 **120 次/分钟/IP**（`app.module.ts`），
   登录接口单独 **5 次/分钟**（`auth.controller.ts` 的 `@Throttle`），健康检查 `@SkipThrottle()` 豁免。
   **新增加密、验证码、导入导出这类可爆破/重开销接口，必须用 `@Throttle` 单独收紧**；
   超过阈值返回 429「请求太频繁，请稍后再试」。
   限流按 IP 统计，依赖 `main.ts` 的 `trust proxy`（只信任内网代理），改它之前先想清楚。
8. **安全响应头**：已接入 `helmet`（`main.ts`）。CSP 故意关闭：本服务唯一的 HTML 是 Swagger UI，
   它依赖内联脚本；真正的前端页面由 Nginx 托管，CSP 应在 Nginx 层配。
9. **CORS**：生产（`NODE_ENV=production`）**没配 `CORS_ORIGIN` 会拒绝启动**，这是刻意行为。
   `origin: true`（任意来源）只在非生产环境生效，不要为了"先跑起来"给生产塞空值。
10. **自动检查**：`server/src/common/controller-conventions.spec.ts` 会扫源码，断言每个路由有
    `@ApiOperation`、非公开 controller 有 `@ApiBearerAuth`、静态接口不用 `any` 接 `@Body()`。
    `npm test` 会一起跑；新增例外必须在文件顶部常量里写明原因，不要删断言。
11. **交付时自检三问**：这个端点有守卫吗？输入有校验/白名单吗？返回字段安全吗？
    回答"否"的必须显式说明原因和风险，不能默认省略。
