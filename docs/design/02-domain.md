# 02 领域模型

> 图用 Mermaid 写在 markdown 里，方便 diff 和搜索。在支持 Mermaid 的编辑器（GitHub / VSCode / Notion）里能直接看到渲染图。

## 1. 实体关系图

```mermaid
erDiagram
    SYS_SYSTEM ||--o{ SYS_USER : "包含"
    SYS_SYSTEM ||--o{ SYS_ROLE : "包含"
    SYS_SYSTEM ||--o{ SYS_DICT_TYPE : "包含"
    SYS_SYSTEM ||--o{ SYS_ROUTE : "包含"
    SYS_SYSTEM ||--o{ SYS_TABLE_CONFIG : "包含"
    SYS_ROLE ||--o{ SYS_USER : "用户绑定一个角色"
    SYS_DICT_TYPE ||--o{ SYS_DICT_ITEM : "包含选项"
    SYS_TABLE_CONFIG ||--|| BIZ_TCID : "1:1 对应一张物理表"

    SYS_SYSTEM {
        uuid id PK
        varchar code UK "系统编码 main/demo"
        varchar name
        boolean is_main "是否主系统"
        int status "1启用 0停用"
    }

    SYS_USER {
        uuid id PK
        uuid system_id FK
        varchar username "同系统内唯一"
        varchar password_hash "bcrypt"
        int status
        uuid role_id FK
    }

    SYS_ROLE {
        uuid id PK
        uuid system_id FK
        varchar code "SUPER_ADMIN/ADMIN..."
        varchar name
        text_array permissions "权限码数组"
    }

    SYS_DICT_TYPE {
        uuid id PK
        uuid system_id FK
        varchar code "如 order_status"
        varchar name
    }

    SYS_DICT_ITEM {
        uuid id PK
        uuid dict_type_id FK
        varchar label "已付款"
        varchar value "paid"
        int sort
    }

    SYS_ROUTE {
        uuid id PK
        uuid system_id FK
        varchar title
        varchar path UK "系统内唯一"
        enum type "CUSTOM|TABLE"
        varchar component_path "自定义页面路径"
        varchar tcid "表格路由绑定的 TCID"
        int sort
        boolean visible
        varchar permission_code
    }

    SYS_TABLE_CONFIG {
        uuid id PK
        varchar tcid UK "T+10位，生成后不可变"
        uuid system_id FK
        varchar name
        varchar physical_table "biz_<tcid>"
        json fields "字段定义数组"
        varchar search_mode "AND|OR|CUSTOM"
        json conditions "CUSTOM 默认条件组"
        json operations "增删改开关+权限码"
        json custom_actions "自定义按钮"
        int page_size
    }

    BIZ_TCID {
        uuid id PK
        timestamptz created_at
        timestamptz updated_at
        text_others "配置里的每个字段 = 一列"
    }
```

> `BIZ_TCID` 不是 Prisma 模型，是运行时按 TCID 动态创建的真实表（`biz_<tcid>`），
> 所以 Prisma schema 里没有它，只在 `ddl.service.ts` 里创建和维护。

## 2. 实体说明

### 2.1 System（子系统 / 租户）

- 主系统固定 `code = 'main'` 且 `is_main = true`，种子脚本创建，**不允许删除**
- 其他都是客户子系统
- `code` 创建后不可修改：它是登录入口的一部分，改了所有用户都登不上

### 2.2 User（用户）

- 账号唯一性是 **`(system_id, username)` 复合唯一**：不同子系统可以有同名用户（`admin` 可以每个系统各有一个）
- `password_hash` 存 bcrypt 哈希，**任何地方都不存明文**
- 一个用户最多绑定一个角色（当前需求够用；多角色属于扩展）

### 2.3 Role（角色）

- 角色就是「权限码数组」，没有更细的数据权限模型（行级权限不在本版本范围）
- `SUPER_ADMIN` 是保留编码，权限固定 `["*"]`，不可修改/删除

### 2.4 DictType / DictItem（业务字典）

- 例：`order_status` → `pending(待付款) / paid(已付款) / shipped(已发货) / cancelled(已取消)`
- 表格字段的 `options.dict = 'order_status'` 时，前端渲染下拉框会来取这个字典

### 2.5 Route（路由 / 菜单）

- 两种类型：
  - `TABLE`：绑 `tcid` → 前端渲染 `<Table :tcid>`，**零代码**
  - `CUSTOM`：绑 `component_path`（相对 `client/src/views` 的 `.vue` 路径）→ 手写页面
- `path` 在同一子系统内唯一
- `permission_code` 为空表示登录即可见；填了则按权限过滤菜单

### 2.6 TableConfig（表格配置 / TCID）

一条记录就是一张表的「说明书」：

| 字段             | 内容                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `tcid`           | 表格编号，前端凭它取配置                                                                    |
| `fields`         | `[{name,label,type,visible,searchable,searchOp,editable,required,width,slot,options,sort}]` |
| `search_mode`    | 多条件组合方式                                                                              |
| `operations`     | 增删改开关 + 各自的权限码                                                                   |
| `custom_actions` | `[{label,value,permission,type,confirm}]`                                                   |
| `physical_table` | 对应的物理表名                                                                              |

### 2.7 biz\_&lt;tcid&gt;（物理表）

- 固定列：`id uuid pk`、`created_at`、`updated_at`
- 业务列：配置里的字段，全部可空（这样加字段不会失败，必填在接口层校验）
- 命名：`biz_` + TCID 小写

## 3. 关键不变式（invariants）

这些规则任何时候都必须成立，写代码/加功能时要守住：

| #   | 不变式                                        | 违反的后果                          |
| --- | --------------------------------------------- | ----------------------------------- |
| I1  | 任何业务查询都必须带 `system_id`              | 跨租户数据泄露（最严重）            |
| I2  | 物理表名只能是 `biz_` + 合法标识符            | SQL 注入 / 误删系统表               |
| I3  | 字段名必须过 `isValidIdentifier()`            | SQL 注入                            |
| I4  | 表格数据值一律参数化，绝不拼 SQL 文本         | SQL 注入                            |
| I5  | `tcid` 生成后不可变                           | 前端硬编码的 TCID、已配路由全部失效 |
| I6  | 超管才允许通过 `X-System-Code` 切换子系统     | 普通用户横向越权                    |
| I7  | 物理表只做加法（ADD COLUMN），不做删除/改类型 | 数据丢失                            |
| I8  | 密码只以 bcrypt 哈希形式存在                  | 拖库即泄露明文                      |
| I9  | 权限判定必须在后端，前端隐藏只是体验          | 绕过前端即越权                      |
| I10 | 删除子系统/表格配置是破坏性操作，必须二次确认 | 数据不可恢复                        |

## 4. 数据流总览（文字版）

```
超管在「表格配置」页提交字段定义
   │
   ├─▶ 后端校验字段名（白名单）→ 生成 TCID
   ├─▶ DDL：CREATE TABLE biz_<tcid>（failure → 整体失败，不留脏数据）
   └─▶ 配置写入 sys_table_config（failure → 回滚 DROP 刚建的表）
            │
            ▼
超管在「路由管理」建 TABLE 路由绑定 TCID
            │
            ▼
客户登录子系统 → GET /api/routes/my → 前端注册动态路由
            │
            ▼
打开 /order/list → <Table :tcid="TDEMOORDERS" />
   ├─▶ GET /api/table/:tcid/config    ← 返回列/搜索项/按钮/我的权限
   ├─▶ GET /api/table/:tcid/data      ← 搜索 DSL → 参数化 SQL → biz_<tcid>
   └─▶ 增删改 → 权限双层校验 → 写 biz_<tcid>
```
