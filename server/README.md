# 后端说明（NestJS + Prisma + PostgreSQL/pgvector）

> 这是「配置驱动后台」的服务端。前端一个 `<Table :tcid="TCID" />` 能渲染出整张表，
> 靠的就是这里的表格配置（TCID）和动态 SQL 能力。
>
> 读完这份文档你应该能回答：**这套后端做了什么、怎么跑起来、哪些地方踩了会炸**。

---

## 1. 这套后端做了什么

一句话：**把「配置」变成「可用的接口和真实数据库表」，并按子系统隔离数据。**

具体拆开：

| 能力             | 说明                                                                              | 关键代码                           |
| ---------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| 认证与权限       | JWT 登录；权限码校验；超管拥有一切                                                | `src/auth/`                        |
| 多租户隔离       | 所有业务表带 `system_id`；超管可用 `X-System-Code` 切换目标子系统                 | `src/auth/system-context.guard.ts` |
| 子系统管理       | 建/改/删子系统（自动附送一个默认管理员角色）                                      | `src/system/`                      |
| 用户/角色        | 子系统内独立的用户与角色，角色=权限码集合                                         | `src/user/`、`src/role/`           |
| 业务字典         | 下拉选项存库，改选项不用改代码                                                    | `src/dict/`                        |
| 路由管理         | CUSTOM（手写页面）和 TABLE（TCID 表格）两种                                       | `src/route/`                       |
| 表格配置（TCID） | 字段即数据库列；生成 TCID；配置入库；`CREATE TABLE` / `ADD COLUMN` / `DROP TABLE` | `src/table-config/`                |
| 动态表格数据     | 按 TCID 分页、搜索、增删改；搜索条件走安全 DSL                                    | `src/table-data/`                  |
| pgvector 预留    | 已建 `vector` 扩展和 `sys_vector_document` 表，暂未接 embedding 模型              | `src/vector/`、迁移 SQL            |

**没有做的事（有意留白）**：

- 没有做「删除字段就 DROP 列」——会丢数据，必须人工确认
- 没有做「改字段类型」——需要重写整张表，同理
- 没有做文件上传、消息队列、定时任务——不属于当前需求

---

## 2. 技术栈

| 类别   | 选型                       | 版本                     | 为什么                                                          |
| ------ | -------------------------- | ------------------------ | --------------------------------------------------------------- |
| 运行时 | Node.js                    | ≥ 20（开发机实测 24.20） | 与前端构建统一                                                  |
| 框架   | NestJS                     | 11                       | 模块化、守卫/拦截器生态成熟，适合做权限和统一响应               |
| ORM    | Prisma                     | 6.x                      | schema 即文档；迁移可离线生成；`$queryRaw` 参数化做动态表很顺手 |
| 数据库 | PostgreSQL + pgvector      | 16 / pgvector 0.7+       | 用 `biz_<tcid>` 真实物理表；pgvector 为后续语义检索预留         |
| 认证   | @nestjs/jwt + passport-jwt | —                        | 无状态 token，方便横向扩容                                      |
| 密码   | bcryptjs                   | —                        | 纯 JS 实现，避免 Windows 上编译 native 模块                     |
| 文档   | @nestjs/swagger            | —                        | `/api/docs` 自动生成接口文档                                    |
| 测试   | jest + ts-jest             | 29                       | 单元测试不依赖数据库，CI 友好                                   |

---

## 3. 目录结构

```
server/
├── prisma/
│   ├── schema.prisma                     # 数据模型（含 pgvector 预留表）
│   ├── migrations/
│   │   ├── migration_lock.toml
│   │   └── 0001_init/migration.sql       # 首次迁移（开头手工加了 CREATE EXTENSION vector）
│   └── seed.ts                           # 种子：主系统+超管、demo 子系统、示例表格/路由/字典
├── src/
│   ├── main.ts                           # 启动入口：/api 前缀、统一响应、Swagger
│   ├── app.module.ts                     # 模块装配 + 三个全局守卫（顺序很关键）
│   ├── common/                           # 常量、权限判定、响应包装、异常过滤、标识符校验、搜索 DSL 的底层工具
│   ├── prisma/                           # PrismaService（全局模块）
│   ├── auth/                             # 登录、JWT 策略、三个守卫
│   ├── system/ user/ role/ dict/ route/  # 管理类业务模块
│   ├── table-config/                     # TCID 生成、字段校验、DDL、配置 CRUD
│   ├── table-data/                       # 搜索 DSL + 动态表数据 CRUD
│   ├── vector/                           # pgvector 状态接口（预留）
│   └── health/                           # 健康检查
├── Dockerfile
├── .env.example                          # 环境变量模板
└── package.json
```

---

## 4. 核心概念（先看这个，否则代码会看不明白）

### 4.1 主系统 vs 子系统

- **主系统**：`sys_system.code = 'main'`，只有超管一个账号，作用是「配置中心」。
- **子系统**：可建多个，靠 `code`（系统编码）区分；客户用它。
- 隔离方式：每张业务表都带 `system_id`，所有查询都必须带它。超管通过请求头 `X-System-Code` 切换当前操作的子系统；普通用户永远只能是自己那个。

### 4.2 TCID（表格配置编号）

在后台配一张表格 → 后端生成形如 `TDEMOORDERS` 的编号 → 前端 `<Table :tcid="TDEMOORDERS" />` 即可渲染整张表。

- 物理表名固定 `biz_<tcid 小写>`，例如 `biz_tdemoorders`
- 生成规则：`T` + 10 位（数字只用 2~9，字母 A~Z），见 `src/table-config/tcid.generator.ts`
- TCID 生成后**不可变**：路由、前端代码、缓存都以它为准

### 4.3 字段即数据库列

配置里的 `fields[]` 每一项都会变成真实列：

| 配置 type     | PostgreSQL 列类型 |
| ------------- | ----------------- |
| string / text | `text`            |
| number        | `numeric(18,2)`   |
| integer       | `integer`         |
| boolean       | `boolean`         |
| date          | `date`            |
| datetime      | `timestamptz`     |
| json          | `jsonb`           |

固定列（不参与配置）：`id uuid`、`created_at`、`updated_at`。

**新增字段** = `ALTER TABLE ... ADD COLUMN`（列可空，所以老数据不受影响）。
**删除字段**：只从配置移除，物理列和数据保留（要真删请人工执行 SQL）。
**改字段类型**：接口直接拒绝（需要重写整张表）。

### 4.4 搜索 DSL（为什么不是「自定义 SQL」）

需求里的「搜索可自定义语句」，实现为**结构化条件组**，不是原始 SQL 文本：

```json
{
  "mode": "CUSTOM",
  "group": {
    "logic": "OR",
    "conditions": [
      { "field": "status", "op": "in", "value": ["paid", "shipped"] },
      { "field": "amount", "op": "gt", "value": 1000 }
    ],
    "groups": [
      {
        "logic": "AND",
        "not": true,
        "conditions": [{ "field": "customer_name", "op": "like", "value": "测试" }]
      }
    ]
  }
}
```

- 支持的运算符：`eq ne like notLike gt gte lt lte in notIn between isNull notNull`
- 字段必须来自表格配置，且必须 `searchable: true`
- 值全部走参数绑定（Prisma `Sql`），**没有任何字符串拼进 SQL 值的位置**
- 表名/列名是唯一必须拼进 SQL 文本的部分，入库前经过 `isValidIdentifier()`（正则 + 关键字黑名单）

> 为什么不做「让用户填原始 WHERE」：那等于把 SQL 注入的钥匙交给超管，还容易把慢查询发到线上。
> 结构化条件组的表达能力与手写 WHERE 等价（AND/OR/NOT 任意嵌套），但不给注入留门。
> 取舍记录见 `docs/adr/0001-技术栈与TCID动态表格决策.md`。

---

## 5. 数据模型

| 表                                | 说明                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `sys_system`                      | 子系统（租户）。`main` 为主系统                                                     |
| `sys_user`                        | 用户，同子系统内用户名唯一                                                          |
| `sys_role`                        | 角色，`permissions String[]` 存权限码；超管为 `["*"]`                               |
| `sys_dict_type` / `sys_dict_item` | 业务字典与选项                                                                      |
| `sys_route`                       | 路由/菜单。`type=TABLE` 时带 `tcid`，`CUSTOM` 时带 `component_path`                 |
| `sys_table_config`                | 表格配置（TCID 说明书）：`fields` / `operations` / `custom_actions` / `search_mode` |
| `sys_vector_document`             | pgvector 预留表（`embedding vector(1024)`）                                         |
| `biz_<tcid>`                      | 每张配置表对应的物理表（运行时动态创建）                                            |

完整字段见 `prisma/schema.prisma`（每张表都写了中文注释）。

---

## 6. API 一览

统一前缀 `/api`，统一响应 `{ code, message, data }`（`code=0` 成功），在线文档 `GET /api/docs`。

### 认证

| 方法 | 路径                 | 说明                                           | 权限 |
| ---- | -------------------- | ---------------------------------------------- | ---- |
| POST | `/api/auth/login`    | 登录，body `{username, password, systemCode?}` | 公开 |
| GET  | `/api/auth/profile`  | 当前用户信息                                   | 登录 |
| POST | `/api/auth/password` | 修改自己的密码                                 | 登录 |

### 子系统（超管）

| 方法   | 路径               | 说明                                |
| ------ | ------------------ | ----------------------------------- |
| GET    | `/api/systems`     | 列表（含用户/路由/表格数量）        |
| POST   | `/api/systems`     | 新建（自动创建默认 ADMIN 角色）     |
| PATCH  | `/api/systems/:id` | 改名/备注/启停（编码不可改）        |
| DELETE | `/api/systems/:id` | 删除（⚠️ 连带删配置 + DROP 物理表） |

### 路由 / 用户 / 角色 / 字典

| 方法              | 路径                                                                      | 权限                             |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------- |
| GET               | `/api/routes`                                                             | `route:read`                     |
| GET               | `/api/routes/my`                                                          | 登录即可（返回当前用户可见菜单） |
| POST/PATCH/DELETE | `/api/routes[/:id]`                                                       | `route:create/update/delete`     |
| GET               | `/api/users?page=&pageSize=&keyword=`                                     | `user:read`                      |
| POST/PATCH/DELETE | `/api/users[/:id]`                                                        | `user:create/update/delete`      |
| GET               | `/api/roles`、`GET /api/roles/permissions`                                | `role:read`                      |
| POST/PATCH/DELETE | `/api/roles[/:id]`                                                        | `role:create/update/delete`      |
| GET               | `/api/dict/types`、`/api/dict/types/:id/items`、`/api/dict/by-code/:code` | `dict:read`（by-code 登录即可）  |
| POST/PATCH/DELETE | `/api/dict/types...`、`/api/dict/items...`                                | `dict:manage`                    |

### 表格配置（TCID）

| 方法   | 路径                          | 说明                                  | 权限           |
| ------ | ----------------------------- | ------------------------------------- | -------------- |
| GET    | `/api/table-configs?keyword=` | 列表                                  | `table:read`   |
| GET    | `/api/table-configs/:tcid`    | 配置详情                              | `table:read`   |
| POST   | `/api/table-configs`          | 新建：生成 TCID + 建物理表 + 配置入库 | `table:create` |
| PUT    | `/api/table-configs/:tcid`    | 修改（加字段会 ADD COLUMN）           | `table:update` |
| DELETE | `/api/table-configs/:tcid`    | 删除（⚠️ DROP 物理表）                | `table:delete` |

新建请求体示例：

```json
{
  "name": "订单列表",
  "searchMode": "AND",
  "pageSize": 20,
  "fields": [
    {
      "name": "order_no",
      "label": "订单号",
      "type": "string",
      "visible": true,
      "searchable": true,
      "searchOp": "like",
      "required": true
    },
    {
      "name": "amount",
      "label": "金额",
      "type": "number",
      "visible": true,
      "searchable": true,
      "searchOp": "between"
    },
    {
      "name": "status",
      "label": "状态",
      "type": "string",
      "visible": true,
      "searchable": true,
      "searchOp": "eq",
      "options": { "dict": "order_status" }
    }
  ],
  "operations": {
    "create": true,
    "update": true,
    "delete": true,
    "createPermission": "data:create"
  },
  "customActions": [{ "label": "标记发货", "value": "ship", "permission": "data:update" }]
}
```

### 动态表格数据（<Table> 组件用的就是这几个）

| 方法   | 路径                                             | 说明                                             | 权限                                                |
| ------ | ------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| GET    | `/api/table/:tcid/config`                        | 渲染配置（列、搜索项、按钮、当前用户可做的操作） | `data:read`                                         |
| GET    | `/api/table/:tcid/data?page=&pageSize=&filters=` | 分页 + 搜索，`filters` 是 JSON 字符串            | `data:read`                                         |
| POST   | `/api/table/:tcid/data`                          | 新增                                             | 表格配置里的 createPermission（默认 `data:create`） |
| PATCH  | `/api/table/:tcid/data/:id`                      | 修改                                             | 同上 updatePermission                               |
| DELETE | `/api/table/:tcid/data/:id`                      | 删除                                             | 同上 deletePermission                               |

> 注意：这三个写接口的权限是「双层」的——先看表格配置里该操作是否开启，再看用户有没有配置里指定的权限码。

### 其它

| 方法 | 路径                 | 说明                                      |
| ---- | -------------------- | ----------------------------------------- |
| GET  | `/api/health`        | 健康检查（含数据库、pgvector 状态），公开 |
| GET  | `/api/vector/status` | pgvector 版本与文档数（预留能力）         |

### 首页统计（ECharts 数据源，需求 003）

| 方法 | 路径                  | 说明                                                                                                                  | 权限     |
| ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| GET  | `/api/stats/overview` | 主系统首页：子系统数/启用数、平台用户/角色/路由/表格/字典/业务行数、每个子系统的用户/路由/表格数、平台近 7 天新增用户 | 仅超管   |
| GET  | `/api/stats/system`   | 子系统首页：本系统的用户/角色/路由/表格/字典计数、各业务表数据量 Top10、各角色用户数、近 7 天新增用户与新增业务数据   | 登录即可 |

实现：`src/stats/`（`stats.service.ts` 查数据、`stats.util.ts` 是纯函数有单测）。
口径说明：

- **business 行数**：表 ≤ 30 张时逐张 `count(*)` 精确统计；超过 30 张退回 `pg_class.reltuples` 估算，
  返回值里 `bizRowsEstimated` 标记是否估算，前端据此显示「（估算）」。
- **新增趋势**：`userTrend` 是 `sys_user` 按天聚合；`dataTrend` 是各业务表按 `created_at` 按天聚合后
  用 `mergeDayCounts` 合并（最多前 20 张表），再 `fillMissingDays` 补成连续 7 天。
- **表名来源**：`pg_class` 元数据 + 正则 `^biz_[a-z0-9]+$` 二次过滤，不拼用户输入。
- **权限**：两个接口都只要求登录（首页是落地页）；`overview` 内部再校验 `isSuper`，普通用户 403。
  子系统统计按 `@SystemId()` 过滤，超管切到子系统后看到的是被切换系统的数据。

---

## 7. 启动方式（本地开发）

### 7.1 准备数据库

方式 A（推荐，用根目录的 docker-compose，宿主机端口 5434）：

```bash
# 在项目根目录
docker compose up -d db
```

方式 B（自己装 PostgreSQL 16）：

```sql
CREATE DATABASE bmf;
\c bmf
CREATE EXTENSION IF NOT EXISTS vector;   -- 必须有，否则建表失败
```

### 7.2 安装依赖并初始化

```bash
cd server
cp .env.example .env          # 按需改 DATABASE_URL / JWT_SECRET
npm install
npx prisma generate           # 生成 Prisma Client（npm run build 里也会跑）
npx prisma migrate deploy     # 建表（会执行 0001_init，含 CREATE EXTENSION vector）
npm run seed                  # 造超管账号 + demo 子系统 + 示例表格/路由/字典
```

### 7.3 起服务

```bash
npm run start:dev             # 开发模式，改代码自动重启，端口 3000
# 或
npm run build && npm run start:prod   # 生产模式跑编译产物
```

启动后：

- 接口基址 <http://127.0.0.1:3000/api>
- 在线文档 <http://127.0.0.1:3000/api/docs>
- 健康检查 <http://127.0.0.1:3000/api/health>

### 7.4 测试

```bash
npm test          # jest --runInBand，47 个用例，不需要数据库
npm run prisma:validate   # 只校验 schema 语法
```

### 7.4.1 冒烟测试（真实调接口，需要数据库 + 后端在跑）

`scripts/smoke-test.ps1` 会按业务顺序走一遍完整链路，**31 项断言**：

登录超管 → 新建子系统 → 切上下文 → 建用户 → 配表格（生成 TCID + 真建表）
→ 数据增删改 + 模糊/区间搜索 → 取渲染配置 → 建路由 → 取菜单
→ 安全用例（字段名注入 400、跨租户 404、伪造 X-System-Code 403、坏 TCID 404、密码错 401）
→ 直接查数据库确认物理表和列存在 → 清理测试数据（含 DROP 表）

```powershell
# ① 先让后端跑起来（另开一个终端）
npm run start:dev

# ② 再跑冒烟
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 `
  -BaseUrl http://127.0.0.1:3000/api
```

> ⚠️ **两个 Windows 上的坑**（脚本里已经处理好，改脚本时注意别破坏）：
>
> 1. **文件必须存成 UTF-8 with BOM**。Windows PowerShell 5.1 会把无 BOM 的 UTF-8 当 GBK 读，
>    脚本里的中文会让解析器直接崩（报"意外的标记 }"之类看不懂的错）。
> 2. **不要用参数 splatting 调 `Invoke-WebRequest`**（`$p=@{...}; Invoke-WebRequest @p`）。
>    在某些非交互式宿主上会静默退出、连错误都不打。脚本里是逐个参数显式写的。
>
> 另外 PowerShell 默认禁止运行未签名脚本，所以命令里带了 `-ExecutionPolicy Bypass`。

### 7.5 npm scripts 速查

| 命令                            | 作用                                             |
| ------------------------------- | ------------------------------------------------ |
| `npm run build`                 | `prisma generate` + `nest build`，产物在 `dist/` |
| `npm run start:dev`             | 开发模式（watch）                                |
| `npm run start:prod`            | 跑 `dist/main.js`                                |
| `npm run prisma:generate`       | 只生成 Prisma Client                             |
| `npm run prisma:validate`       | 校验 schema（不需要连库）                        |
| `npm run prisma:migrate:deploy` | 执行 `prisma/migrations` 里的迁移                |
| `npm run prisma:migrate:diff`   | 从 schema 重新生成迁移 SQL（离线，不连库）       |
| `npm run seed`                  | 初始化种子数据（可重复执行）                     |
| `npm test`                      | 单元测试                                         |

---

## 8. 注意事项（踩过的坑，按重要性排）

1. **数据库必须装 pgvector 扩展**
   `0001_init/migration.sql` 第一行就是 `CREATE EXTENSION IF NOT EXISTS vector;`。
   用普通 `postgres` 镜像会失败，必须用 `pgvector/pgvector:pg16`（或自己装扩展）。
   数据库账号需要创建扩展的权限（一般超级用户即可）。

2. **JWT_SECRET 不要用示例值**
   `server/.env` 和部署用的根 `.env` 里都有 `JWT_SECRET`，上线前必须换成长随机串：
   `openssl rand -hex 32`。改了它，所有已登录用户都会掉线，需要重新登录（正常现象）。

3. **权限是登录时的快照**
   权限码签在 token 里，改了角色权限后**用户需要重新登录**才生效。
   这是有意的取舍（每个请求都查库会更慢）。如果要「立刻生效」，得改成守卫里查库。

4. **DDL 只做加法**
   - 加字段：`ADD COLUMN`，列可空，不影响老数据
   - 删字段：只从配置移除，物理列保留
   - 改类型：直接拒绝（提示新建字段）
     这三条是安全底线，不要为了"方便"去改。

5. **标识符校验不能放宽**
   `src/common/identifiers.ts` 是全系统唯一把用户输入拼进 SQL 文本的地方。
   放宽正则或关键字黑名单之前，先看 `src/common/identifiers.spec.ts` 里的注入用例。

6. **迁移不要用 `prisma migrate dev`**
   这个命令会尝试连库并可能重置数据，本地开发也不要用。
   改 schema 后重新生成迁移 SQL：
   `npm run prisma:migrate:diff > prisma/migrations/0002_xxx/migration.sql`，再手工确认。

7. **种子脚本可重复跑，但会重置演示数据**
   `npm run seed` 用 upsert，重复执行不会报错；示例表格数据只在表为空时插入。
   生产环境首次部署跑一次即可。

8. **超管账号只在 seed 时创建**
   改 `SUPER_ADMIN_PASSWORD` 不会改已有账号的密码。
   要改密码：登录后调 `POST /api/auth/password`，或直接改库里的 `password_hash`（bcrypt）。

9. **多租户隔离靠 `X-System-Code`**
   超管忘了切子系统，配置就会落到主系统上（表现为"我在 demo 里配的表不见了"）。
   页面上顶栏有明确的「正在配置：xxx」提示。

---

## 9. 常见问题

**Q：启动报 `Can't reach database server`**
A：数据库没起来，或 `.env` 里的 `DATABASE_URL` 端口不对。
用根目录 compose 起的库端口是 **5434**（不是 5432）。

**Q：建表报 `type "vector" does not exist`**
A：pgvector 扩展没装。确认用的是 `pgvector/pgvector:pg16` 镜像，或手工 `CREATE EXTENSION vector;`。

**Q：`prisma migrate deploy` 报 `P3005: database is not empty`**
A：库里有表但没有迁移记录（比如手工建过表）。开发库直接重建即可；
生产库需要人工确认后 `prisma migrate resolve --applied 0001_init`。

**Q：Windows 上 `npm test` 报 `spawn EPERM`**
A：jest 默认用子进程跑并发 worker，某些受限终端/沙箱不允许。脚本已经固定 `--runInBand`，正常不会遇到。

**Q：接口返回 401「登录状态已失效」**
A：token 过期（默认 8 小时）或 `JWT_SECRET` 变了。重新登录即可。

---

## 10. 代码格式化

缩进 **2 空格**，其余风格由 Prettier 决定，不要手写缩进。

```bash
cd ..            # 回到仓库根目录
npm install      # 只需一次，装根目录的开发期 Prettier
npm run format   # 格式化整个仓库
```

编辑器里开了 formatOnSave 的话，Ctrl+S 就是同一套规则，不会二次重排。
`prisma/schema.prisma` 和 `*.sql` 不在格式化范围内（Prettier 没有对应解析器）。

---

## 10. 需求 002 变更（2026-10-19）

### 10.1 数据模型

| 变更                    | 说明                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `sys_route.access_type` | `PUBLIC`（默认，登录即可见）/ `ROLE`（需要角色在权限树勾选）                          |
| `sys_route.config`      | JSON，路由级配置；CUSTOM 页面通过 `props.routeConfig` 接收；后端校验合法性，上限 20KB |
| 迁移                    | `prisma/migrations/0002_route_access_config/`                                         |

`permissionCode` 字段保留（兼容老数据），但后台界面已不再让人手填。

### 10.2 权限码新格式

| 类型           | 格式                                                               | 生成方式                         |
| -------------- | ------------------------------------------------------------------ | -------------------------------- |
| 菜单           | `menu:<routeId>`                                                   | 系统按路由 id 生成（权限树勾选） |
| 表格增删改     | `data:create:<tcid>` / `data:update:<tcid>` / `data:delete:<tcid>` | 新建表格配置时按 TCID 自动生成   |
| 表格自定义按钮 | 配置里填的 permission，缺省 `data:action:<tcid>:<value>`           | 配置时决定                       |
| 系统功能       | 沿用 `user:read`、`role:create`…（`ALL_PERMISSIONS`）              | 固定                             |

> ⚠️ **角色保存不再用固定白名单过滤权限码**（会误杀动态码，踩过一次坑）。
> 现在是格式校验：字母开头，只允许字母/数字/`_`/`:`/`-`，最长 128 字符。

### 10.3 新增接口

| 方法 | 路径                         | 说明                                                   | 权限        |
| ---- | ---------------------------- | ------------------------------------------------------ | ----------- |
| GET  | `/api/roles/permission-tree` | 权限树（系统功能 + 菜单与按钮），返回 `{tree, keyMap}` | `role:read` |

`GET /api/routes/my` 的过滤逻辑同步更新：`accessType=ROLE` 的菜单要求用户具备 `menu:<routeId>`。

### 10.4 Windows 下 build/test 的坑（重要）

`npm run build` 会先跑 `prisma generate`，它会重命名 `node_modules/.prisma/client/*.dll.node`。
**如果同时有 `npm run start:dev` 在跑，引擎 DLL 被占用 → EPERM 报错。**
所以：先停 dev 再 `npm run build`；或者用 `npx nest build`（只编译）和 `npx jest --runInBand`（跑测试），这两个不碰 generate。

### 10.5 冒烟脚本

| 脚本                     | 覆盖                                                         | 断言数 |
| ------------------------ | ------------------------------------------------------------ | ------ |
| `scripts/smoke-test.ps1` | TCID 建表、增删改查、搜索、跨租户/注入等安全用例             | 31     |
| `scripts/smoke-002.ps1`  | 权限树、路由 accessType/config、按 TCID 按钮权限、菜单可见性 | 29     |

### 10.6 权限树的结构（2026-10-19 微调）

`GET /api/roles/permission-tree` 返回的树：

```
系统功能（按 ALL_PERMISSIONS.group 二级分组）
├ 主系统 → 子系统管理
├ 路由   → 查看/新建/修改/删除路由
├ 用户   → 查看/新建/修改/删除用户
├ 角色   → …
├ 字典   → …
└ 表格配置 → …
菜单与按钮
├ 订单管理（accessType=ROLE 才可勾）
│  ├ 新增（订单列表）= data:create:TORDER      ← 新表的按 TCID 权限码
│  ├ 修改（订单列表）
│  ├ 删除（订单列表）
│  └ 标记发货（订单列表）= data:action:TORDER:ship
├ 老表菜单（accessType=ROLE）
│  └ 新增（老表）= data:create   note: 旧版全局权限码，所有用这个码的表都会受影响
└ 公开菜单（disabled，标注「公开菜单（登录即可见）」）
```

三条规则：

1. **「表格数据」这一组（全局 `data:read/create/update/delete`）不再放进系统功能**。
   按钮权限只在各自表格下出现，否则老表用的是全局码，会和系统功能里的同名项"看起来重复"。
2. 老表（需求 002 之前创建）的按钮节点会带 `note`：说明这是旧版全局码、影响所有用该码的表。
3. 同一张表里多个按钮共用一个权限码时（比如自定义按钮配了 `data:update`），
   第二个节点会带 `note`：「与「修改（订单列表）」是同一个权限码，勾一个两个都会生效」。

> 角色编辑保存时，前端会把「树上不存在的旧权限码」原样保留
> （`client/src/views/base/role/index.vue` 的 `legacyCodes`），避免打开旧角色点保存就把老权限删掉。

### 10.7 权限码迁移脚本（把老表迁成按 TCID）

需求 002 之后新建的表用 `data:create:<tcid>`；**老表（改动前创建的）仍是全局 `data:*`**。
提供一个一次性迁移脚本，把老表 + 已有角色一起迁到新格式：

```bash
cd server

# 1. 先预览（不改库，看看会动哪些表/角色）
npm run migrate:002:dry

# 2. 确认无误后执行（一个事务，失败全回滚）
npm run migrate:002
```

**迁移规则**（实现在 `src/role/permission-migration.ts`，有单测）：

| 对象       | 规则                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 表格配置   | `createPermission/updatePermission/deletePermission` 正好是 `data:create/update/delete` → `data:<op>:<tcid>` |
| 自定义按钮 | `permission` 正好是上面三个全局码 → 同上（换成该表的按 TCID 码）                                             |
| 角色       | 这三个全局码 → 「所有曾依赖该全局码的表」对应的按 TCID 码（**否则迁移后老角色会失去权限**）                  |
| 不动       | `data:read`（控制器级权限）、`route:*`、`menu:*`、自定义码（如 `detail`）、超管的 `*`                        |

**性质**：幂等（第二次跑显示"无需迁移"）、单事务、dry-run 可预览。
**风险与准备**：会改角色权限，执行前先 `pg_dump` 备份（见 DEPLOY.md 7.2）；
执行后让相关账号**重新登录**（权限签在 token 里，旧 token 还是老权限）。

> 新环境不用跑：`npm run seed` 现在直接创建按 TCID 的权限码。

**当前机器已执行**：本地库 `bmf-db` 已完成迁移（TDEMOORDERS + demo 的 ADMIN/USER 角色），
第二次跑输出"无需迁移"，`demo` 账号增删改查验证通过。
