# 术语表（GLOSSARY）

> 优先级最高的文档。**同一个概念叫法不统一，是沟通成本的头号来源。**
> 这份表里的词，代码、文档、界面上都用同一个说法。

---

## 系统层

| 术语 | 英文 / 代码 | 定义 | 在哪 |
|---|---|---|---|
| **主系统** | main system | 只有超管一个账号的系统，作用是**配置中心**：建子系统、配表格、配路由、配用户角色字典。不对客户开放业务页面 | `sys_system.code = 'main'` |
| **子系统** | subsystem / tenant | 真正给客户用的独立后台。可建多个，数据互相隔离 | `sys_system` 非 main 的行 |
| **租户** | tenant | 「子系统」的另一种叫法，强调数据隔离维度。代码里就是 `system_id` | `system_id` 字段 |
| **系统编码** | system code | 子系统的短标识（如 `demo`），登录时要填。创建后**不可修改** | `sys_system.code` |
| **超管** | super admin | 主系统里角色编码为 `SUPER_ADMIN` 的账号，权限为 `["*"]`（通配） | `sys_role.code` |
| **子系统上下文** | system context | 本次请求实际操作的子系统。超管可用请求头 `X-System-Code` 切换 | `request.systemId` |

## 表格配置层（本系统最核心）

| 术语 | 英文 / 代码 | 定义 | 在哪 |
|---|---|---|---|
| **TCID** | Table Config ID | 表格配置编号，形如 `TDEMOORDERS`（`T` + 10 位）。前端靠它取配置渲染整张表。生成后不可变 | `sys_table_config.tcid` |
| **表格配置** | table config | 「这张表长什么样」的说明书：字段、搜索项、按钮、权限 | `sys_table_config` 一行 |
| **物理表** | physical table | 真实存业务数据的 PostgreSQL 表，命名固定 `biz_<tcid 小写>` | `biz_tdemoorders` |
| **字段** | field | 一个字段同时是「数据库列」+「表格列」+「搜索项」+「表单项」 | `fields` JSON |
| **字段名** | field name | 就是数据库列名，必须是小写字母开头的标识符 | `fields[].name` |
| **标签** | label | 字段给人看的名字，表格表头、表单、搜索框都用它 | `fields[].label` |
| **搜索模式** | search mode | 多条件之间怎么组合：`AND` / `OR` / `CUSTOM`（前端自由组合） | `sys_table_config.search_mode` |
| **搜索 DSL** | search DSL | 结构化的搜索条件组（字段+运算符+值），**不是原始 SQL 文本** | `search-builder.ts` |
| **操作列配置** | operations | 增/改/删三个操作「开不开」+ 各自需要的权限码 | `operations` JSON |
| **自定义按钮** | custom action | 操作列里额外加的按钮：`label` 给人看，`value` 给代码用 | `custom_actions` JSON`[{label,value,permission}]` |

## 前端渲染层

| 术语 | 英文 / 代码 | 定义 |
|---|---|---|
| **公用表格组件** | `<Table>` | `client/src/components/table/index.vue`，传 `tcid` 就渲染整张表 |
| **表格页面** | TABLE page | 由 TCID 自动渲染的页面，不需要写业务代码 |
| **自定义页面** | CUSTOM page | 手写的 `.vue` 文件，通过路由的 `componentPath` 挂上去 |
| **插槽约定** | slot convention | 自定义入口：按钮用 `#action-<value>`，单元格用 `#col-<字段名>` |
| **按钮 value** | action value | 自定义按钮的机器标识，插槽名就是由它拼出来的 |
| **动态路由** | dynamic route | 登录后从数据库读出来、运行时注册的路由（子系统菜单） |

## 权限与安全

| 术语 | 英文 / 代码 | 定义 |
|---|---|---|
| **权限码** | permission code | 形如 `data:create` 的字符串，角色持有，接口校验 |
| **通配权限** | `*` | 超管的权限，代表全部 |
| **权限快照** | permission snapshot | 权限在**登录时**签进 token，改权限后需重新登录才生效 |
| **标识符校验** | identifier validation | 表名列名进 SQL 前必须过的白名单校验（防注入的唯一防线） |
| **参数化查询** | parameterized query | 数据值走占位符绑定，不拼进 SQL 文本 |

## 部署与运行

| 术语 | 定义 |
|---|---|
| **迁移** | `prisma/migrations/` 里的 SQL，容器启动时自动 `migrate deploy` |
| **种子** | `server/prisma/seed.ts`，创建主系统/超管/demo 数据，可重复执行 |
| **pgvector** | PostgreSQL 的向量扩展，本项目已启用并建了 `sys_vector_document` 表，**语义检索功能属于预留，尚未接入 embedding 模型** |
| **健康检查** | `GET /api/health`，返回数据库与 pgvector 状态 |
