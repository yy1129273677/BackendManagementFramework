# 后端安全基线（NestJS）

> 这份文档回答三个问题：**新增接口时必须守住哪些线、当前项目还缺什么、怎么自动抓住漏网之鱼。**
>
> 写代码前看第二节，交付前过第六节的三问。AGENTS.md §11 是这里的精简版。

---

## 1. 先说清楚：通用模板不能照搬

网上常见的 NestJS 安全基线大多是"从零新建项目"的假设。这个项目有几处**刻意做出的不同选择**，
直接照抄模板会改坏功能：

| 通用基线写法                                     | 本项目实际                                                                     | 结论                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `whitelist: true` + `forbidNonWhitelisted: true` | `main.ts` 明确写了 `whitelist: false`，DTO **不使用** `class-validator` 装饰器 | **不能直接改**。开了 whitelist 会把所有请求体字段剥光（因为没有任何校验元数据），动态表格接口还会被 400 |
| `AuthGuard + RolesGuard`                         | 全局注册的是 `JwtAuthGuard → SystemContextGuard → PermissionsGuard`            | 按实际类名理解；放行只有 `@Public()` 一条路                                                             |
| 响应 DTO / `class-transformer` 序列化            | Prisma 查询用显式 `select`，或手工组装返回对象                                 | 保持 `select` 白名单，不要改成"返回整模型再序列化"                                                      |
| 调试接口返回环境信息                             | `/api/health` 只返回状态、时间、db/pgvector 可用性                             | 符合；但**新增**调试接口仍需遵守"不返回 env / 连接串"                                                   |

如果将来要把 `whitelist` 打开，正确顺序是：**先给 7 个 DTO 补 `class-validator` 装饰器 →
单独给 `table-data` 的动态 body 做例外 → 再改 `ValidationPipe`**。这三步缺一步都会炸。

---

## 2. 强制规则（每条都可核查）

### S1 认证

- 全局守卫链固定为 `JwtAuthGuard → SystemContextGuard → PermissionsGuard`（注册顺序不能变）。
- 新接口默认受保护。**唯一放行方式是显式 `@Public()`**，且 `@ApiOperation.summary` 要标注"公开接口"。
- 核查：`grep -r "@Public" server/src --include=*.controller.ts`，每一处都要能说出为什么公开。

### S2 授权

- 特权操作加 `@RequirePermissions("权限码")`。
- 权限码要同步三处：后端 `common/constants.ts` 的 `ALL_PERMISSIONS`、前端 `constants/permissions.ts`、
  `docs/design/05-rules.md` 的权限矩阵。
- 表格按钮权限按路由区分（`data:create:<tcid>:route:<routeId>`），判断逻辑在 `common/permission-scope.ts`。

### S3 多租户隔离

- 任何 `findMany / findFirst / update / delete` 都必须带 `systemId` 条件。
- `systemId` 来自 `SystemContextGuard`，不是前端传来的值。
- 核查：新增 service 方法时搜一遍 `where: {`，确认没有只按 `id` 查的情况。

### S4 输入校验

- **静态结构接口**必须用 DTO 类，禁止 `@Body() body: any`。
- **动态表格接口**（`table-data`）允许 `Record<string, any>`，但必须：
  1. 只接受配置里 `editable = true` 的字段；
  2. 每个值过 `normalizeValue` 做类型转换；
  3. `required` 字段为空时返回 400。
- 字段名/表名必须过 `common/identifiers.ts`，不允许直接拼。
- 核查：`grep -rn "@Body()" server/src --include=*.controller.ts`，逐个看类型。

### S5 响应字段白名单

- 禁止原样返回 Prisma 查询结果（`include: { role: true }` 这种要改成 `select`）。
- 禁止返回：`passwordHash`、`password`、`token`、`secret`、`DATABASE_URL`、任何 `process.env` 内容、堆栈信息。
- 现状：`user.service.ts` 列表与详情、`auth.service.ts` 的登录与 `profile` 都已是白名单组装。
- 核查：新增查询后看 `select`，只返回页面需要的字段。

### S6 SQL 安全

- 值一律参数化（`Prisma.sql` / `${value}`）。
- 只有**经过校验的标识符**能用 `Prisma.raw`。
- 不开放"原始 SQL WHERE"；搜索条件走 `table-data/search-builder.ts` 的结构化条件组。
- 日期/时间/JSON 参数要显式 `::date` / `::timestamptz` / `::jsonb`（`pgParamCast`），
  否则 Prisma 会按 `text` 发送，PostgreSQL 直接报类型不匹配。

### S7 速率限制

- 已接入 `@nestjs/throttler`：
  - 全局 **120 次/分钟/IP**（`app.module.ts` 的 `ThrottlerModule.forRoot`）；
  - 登录接口 **5 次/分钟**（`auth.controller.ts` 的 `@Throttle`），防暴力破解；
  - 健康检查 `@SkipThrottle()`，避免探活轮询把配额吃光。
- 为什么全局不是 10 次：后台页面一次加载就要 5~10 个请求，10 次/分钟会把正常用户锁死。
- 新增可爆破/重开销接口（改密、验证码、导入导出）时，必须用 `@Throttle` 单独收紧。
- **依赖前提**：限流按 IP 统计，`main.ts` 已设置 `trust proxy = "loopback, linklocal, uniquelocal"`。
  只信任内网代理（Nginx 容器），不信任公网客户端伪造的 `X-Forwarded-For`，否则 3001 直连可以绕过限流。
- 已知限制：默认内存存储，**多副本部署时各算各的**，届时要换 Redis storage。

### S8 安全响应头

- 已接入 `helmet`（`main.ts`），保留默认的 `X-Content-Type-Options`、`X-Frame-Options`、
  `Referrer-Policy` 等。
- `contentSecurityPolicy: false` 是刻意关闭：本服务唯一的 HTML 是 Swagger UI，依赖内联脚本；
  真正的前端页面由 Nginx 托管，CSP 应在 `client/nginx.conf` 或外层代理配置。

### S9 CORS

- 生产（`NODE_ENV=production`）**没配 `CORS_ORIGIN` 会直接拒绝启动**，防止带着 `origin: true` 上线。
- 非生产环境未配置时退化为 `origin: true`（接受任意来源），只适合本地开发。
- `docker-compose.yml` 已显式传 `NODE_ENV=production`，并从 `.env` 读取 `CORS_ORIGIN`。
- 核查：部署时 `docker compose config` 看 `CORS_ORIGIN` 是否是你实际的前端地址。

### S10 错误与日志

- 统一异常过滤器已把错误包装成 `{ code, message, data }`，不要把原始异常/SQL 直接抛给前端。
- 日志里不要打印完整请求体（可能含密码）、token、连接串。
- 调试路由不得返回环境变量、数据库地址、账号密码。

### S11 密钥管理

- 只从 `.env` 读，禁止硬编码进代码、文档、提交记录。
- `JWT_SECRET` 必须显式设置；`docker-compose.yml` 已用 `${JWT_SECRET:?...}` 强制校验。
- 轮换密钥后所有 token 立即失效，属于预期行为，要提前告知使用者。

### S12 暴露面控制

- 生产只暴露 `8081`（前端 + 经 Nginx 的 `/api`）。
- `3001` 是 Swagger 文档专用端口，仅测试环境保护，用云安全组控制来源 IP。
- 数据库端口只绑 `127.0.0.1:5434`，永远不要对公网开放。

---

## 3. 当前缺口清单（2026-10 盘点）

| 缺口                        | 影响                                   | 状态（2026-10-21）                      |
| --------------------------- | -------------------------------------- | --------------------------------------- |
| 登录接口无速率限制          | 可被暴力破解密码                       | ✅ 已修复（全局 120/分钟，登录 5/分钟） |
| 未接入 `helmet`             | 缺少基础安全响应头                     | ✅ 已修复                               |
| CORS 未配置时接受任意来源   | 生产环境配置遗漏会造成跨域放开         | ✅ 已修复（生产缺配置拒绝启动）         |
| 漏写 Swagger 注解 / 裸 any  | 文档退化、输入校验靠自觉               | ✅ 已有源码扫描单测兜底                 |
| 无 ESLint                   | 缺守卫、缺校验只能靠源码扫描 + 人工    | ⏳ 待决策（见 4.2）                     |
| 无 CI                       | 测试和格式检查靠本地自觉               | ⏳ 待补                                 |
| 响应结构未在 Swagger 中建模 | 文档看不到返回字段，但不影响运行时安全 | ⏳ 可选                                 |
| 限流为单机内存存储          | 多副本部署时限流不共享                 | ⏳ 有需要再换 Redis                     |

---

## 4. 工具链：生成时带上，生成后抓住

### 4.1 生成时（提示词 / 规范）

- 本文档 + `AGENTS.md` §10（Swagger 规范）、§11（安全基线）。
- 新增接口的交付说明里必须回答第六节的三问。

### 4.2 生成后（静态扫描）

**`eslint-plugin-nestjs-security`**（npm，已有 3.x 版本）——专门做这件事：

- 检测缺失的认证守卫
- 检测没有校验的端点
- 检测未限流的控制器方法
- 检测响应暴露私有字段
- 提供 `recommended` / `strict` 两个预设

**`@darraghor/eslint-plugin-nestjs-typed`**（备选/补充）：

- `api-methods-should-be-guarded`：方法缺少守卫
- `validation-pipe-should-use-forbid-unknown`：校验管道未禁止未知字段
- `api-method-should-specify-api-response`：Swagger 响应未声明（和本文档 §10 呼应）

> ⚠️ **前提**：本项目目前**没有 ESLint 链**（AGENTS.md §2、§8 明确规定"要加 lint 需要先讨论规则集"）。
> 引入 ESLint 会新增配置文件、依赖和格式化冲突风险，属于需要单独决策的改动，不要顺手加。

**已落地的替代方案**：`server/src/common/controller-conventions.spec.ts`
（源码扫描式 Jest 单测，不连数据库，`npm test` 自动执行）：

```
读取 server/src/**/*.controller.ts 源码
  → 断言每个 @Get/@Post/... 方法上方存在 @ApiOperation
  → 断言非 @Public 方法所在 controller 有 @ApiBearerAuth
  → 断言 @Body() 参数类型不是 any（table-data 白名单例外）
  → 兜底断言扫到的 controller / 路由数量，防止正则失效导致用例假通过
```

这类测试不需要 Nest 容器、不需要数据库，跑起来和现有 `*.spec.ts` 一样快。
例外必须写在文件顶部的 `PUBLIC_MARKER` / `DYNAMIC_BODY_FILES` 常量里并注明原因，不要删断言。

### 4.3 测试（行为验证）

| 用例类型             | 写法                                             | 是否需要数据库 |
| -------------------- | ------------------------------------------------ | -------------- |
| 守卫/权限判定        | 纯函数单测（已有 `read-access.spec.ts` 等）      | 否             |
| 401：无 token 访问   | e2e（supertest）                                 | 需要           |
| 403：有 token 无权限 | e2e，准备两个角色账号                            | 需要           |
| 多余字段被忽略/拒绝  | e2e，发送未声明字段，断言不落库                  | 需要           |
| 密码不外泄           | 单测：对 service 返回对象断言不含 `passwordHash` | 否             |
| 跨租户访问           | e2e：A 系统 token 访问 B 系统资源，断言 404/403  | 需要           |

> 项目硬性规则是"**后端单测不能连数据库**"。e2e 用例要单独放 `server/test/`，
> 用独立脚本（如 `npm run test:e2e`）运行，**不要**塞进 `npm test`，否则新机器和 CI 会红。

### 4.4 CI（合并门槛）

**现状**：仓库没有 `.github/workflows`。

建议最小门槛（无数据库也能跑）：

```yaml
# 伪代码，说明门槛内容
- npm run format:check
- cd server && npx tsc --noEmit -p tsconfig.json && npm test
- cd client && npm run typecheck && npm test
# 接了 ESLint 之后再加：npm run lint
```

带数据库的 e2e 用 GitHub Actions 的 `services: postgres` 单独跑一个 job，不阻塞纯逻辑 job。

---

## 5. 人工复核：交付前必答三问

1. **这个端点有守卫吗？** —— 没有的话，为什么可以公开（`@Public()` 的理由必须写清楚）。
2. **输入有校验/白名单吗？** —— 静态接口看 DTO；动态接口看 `editable` 白名单和类型转换。
3. **返回字段安全吗？** —— 有没有把整条 Prisma 记录、密码哈希、token、env 带出去。

**交付说明模板**：

```
本模块已应用的安全项：
- 认证：全局 JwtAuthGuard，无 @Public 例外
- 授权：@RequirePermissions("dict:manage")
- 多租户：所有查询带 systemId
- 输入：CreateDictTypeDto（含 code/name 校验）
- 返回：显式 select，不含 passwordHash

未应用/缺失项：
- 限流：项目未接入 throttler，登录接口暂无速率限制（P0，待单独处理）
```

---

## 6. 优先级建议

1. ✅ **P0 已完成**：登录限流（全局 120/分钟、登录 5/分钟）；生产缺 `CORS_ORIGIN` 拒绝启动。
2. ✅ **P1 已部分完成**：`helmet` 已接入；**还差**给敏感接口补 401/403 的 e2e 用例。
3. ⏳ **P2**：引入 ESLint + `eslint-plugin-nestjs-security`（需先决策）；加最小 CI。
4. ⏳ **P3**：Swagger 响应结构建模（`{ code, message, data }` 包装的类型）。
