# 03 关键流程

> 图用 Mermaid 写在 markdown 里。下面 5 条是这套系统的主动脉，
> 看懂了这 5 张图，代码基本就懂了。

## 流程 1：超管登录

```mermaid
sequenceDiagram
    autonumber
    participant U as 浏览器
    participant W as Nginx(web)
    participant A as NestJS(server)
    participant D as PostgreSQL

    U->>W: POST /api/auth/login {username:"yy1", password:"***", systemCode:""}
    W->>A: 反向代理到 server:3000
    A->>D: 查 sys_system (code='main')
    A->>D: 查 sys_user (system_id + username 复合唯一)
    A->>A: bcrypt.compare(明文密码, password_hash)
    A->>A: 判断 isSuper（主系统 + 角色 SUPER_ADMIN）
    A->>A: 把 permissions 签进 JWT
    A-->>U: { code:0, data:{ token, user } }
    U->>U: token 写 localStorage，后续请求带 Authorization: Bearer
```

**注意**：账号不存在和密码错误返回同一句话「账号或密码错误」——防止被人试探哪些用户名存在。

## 流程 2：建子系统 → 切换上下文 → 配置

```mermaid
sequenceDiagram
    autonumber
    participant S as 超管
    participant C as 前端
    participant A as NestJS
    participant D as PostgreSQL

    S->>C: 在「子系统管理」新建 demo（code/name）
    C->>A: POST /api/systems
    A->>D: 事务：INSERT sys_system + INSERT 默认 ADMIN 角色（仅用户/角色权限）
    A-->>C: 新子系统
    S->>C: 顶栏选「demo」→ 前端写 localStorage.bmf_system_code='demo' → 整页刷新
    Note over C: 之后每个请求自动带 X-System-Code: demo
    C->>A: GET /api/routes/my  (X-System-Code: demo)
    A->>A: SystemContextGuard：超管校验 + 解析 systemId=demo 的 id
    A->>D: 查 sys_route WHERE system_id = demo
    A-->>C: 当前用户可见菜单
    Note over S,A: 接下来所有的路由/表格/用户/字典操作，全部落在 demo 上
```

**关键**：`X-System-Code` 只有超管能生效；普通用户带上也会被 403。数据隔离靠这个值。

## 流程 3：配置一张表格 → 生成 TCID（含失败回滚）

```mermaid
sequenceDiagram
    autonumber
    participant S as 超管
    participant A as NestJS
    participant D as PostgreSQL

    S->>A: POST /api/table-configs {name, fields[], operations, customActions}
    A->>A: normalizeFields / normalizeCustomActions / normalizeOperations
    Note over A: 字段名校验失败 → 400，不产生任何副作用
    A->>A: generateTcid() → 如 TDEMOORDERS
    A->>D: CREATE TABLE biz_tdemoorders (id/created_at/updated_at + 业务列)
    alt 建表失败
        A-->>S: 500，配置未入库，无脏数据
    else 建表成功
        A->>D: INSERT sys_table_config（fields/operations/custom_actions 入库）
        alt 写配置失败
            A->>D: DROP TABLE biz_tdemoorders（回滚）
            A-->>S: 500
        else 成功
            A-->>S: { tcid: "TDEMOORDERS", ... }
        end
    end
```

**为什么要这个顺序**：先建表再写配置，并在写配置失败时 DROP 表——
避免留下「有配置没表」（页面能打开但查询报错）或「有表没配置」（孤儿表）的中间状态。

## 流程 4：前端渲染一张表格 + 增删改 + 自定义按钮

```mermaid
sequenceDiagram
    autonumber
    participant P as 业务页面
    participant T as <Table> 组件
    participant A as NestJS
    participant D as PostgreSQL

    P->>T: <Table :tcid="TDEMOORDERS" />
    T->>A: GET /api/table/TDEMOORDERS/config
    A->>D: 查 sys_table_config（带 system_id 隔离）
    A->>A: 计算当前用户能做什么（权限 ∩ 配置开关）
    A-->>T: { fields, columns, searchFields, operations, customActions }
    T->>T: 渲染搜索栏 / 列 / 分页 / 操作列

    T->>A: GET /api/table/TDEMOORDERS/data?page=1&filters={...}
    A->>A: parseSearchPayload → 校验字段/运算符/类型
    A->>D: SELECT * FROM biz_tdemoorders WHERE <参数化条件> LIMIT/OFFSET
    A-->>T: { list, total }

    Note over P,T: 自定义按钮：配置里 value='ship' → 页面写 #action-ship 插槽
    P->>A: （页面自己调）PATCH /api/table/TDEMOORDERS/data/:id {status:"shipped"}
    A->>A: 校验：配置开启 update + 用户有 updatePermission
    A->>D: UPDATE biz_tdemoorders SET ... WHERE id=:id::uuid
    A-->>P: 更新后的行
    P->>T: reload()
```

**两条重要边界**：

- 搜索条件里的字段必须「在配置里」且 `searchable: true`，否则 400（防止用隐藏字段做探测）
- 写操作是**双层校验**：表格配置开关 + 权限码，任一不满足都 403

## 流程 5：给已有表格加字段（ADD COLUMN）

```mermaid
sequenceDiagram
    autonumber
    participant S as 超管
    participant A as NestJS
    participant D as PostgreSQL

    S->>A: PUT /api/table-configs/TDEMOORDERS {fields:[...旧字段, 新字段]}
    A->>A: normalizeFields（新字段也要过标识符校验）
    A->>D: 查 information_schema.columns 得到现有列
    A->>D: ALTER TABLE biz_tdemoorders ADD COLUMN "new_col" text
    A->>D: UPDATE sys_table_config SET fields = ...
    A-->>S: { 配置, addedColumns:["new_col"], removedFields:[] }
```

**不会发生的事**：

- 已移除的字段：只从配置移除，物理列和数据保留（返回 `removedFields` 提示）
- 改字段类型：直接 400 拒绝（提示「请新建字段代替」）
