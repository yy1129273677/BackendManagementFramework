# 前端说明（Vue3 + Vite + Element Plus）

> 这个前端的核心是一个**公用表格组件 `<Table :tcid="TCID" />`**：
> 给一个编号，它自己把整张业务表渲染出来（搜索栏、列、分页、增删改、自定义按钮）。
>
> 读完这份文档你应该能回答：**前端做了什么、怎么跑起来、怎么用 Table 组件写自己的页面、哪些地方容易踩坑**。

---

## 1. 前端做了什么

### 1.1 主系统页面（写死在代码里，给超管用）

| 路由             | 页面                    | 作用                                                    |
| ---------------- | ----------------------- | ------------------------------------------------------- |
| `/login`         | 登录页                  | 用户名 + 密码 + 系统编码（留空=主系统）                 |
| `/dashboard`     | 首页                    | 四步上手指引 + 后端/数据库/pgvector 状态                |
| `/system`        | 子系统管理              | 建/改/删子系统，「进入配置」切换当前子系统              |
| `/table-config`  | 表格配置（TCID 设计器） | 配字段、搜索模式、操作权限、自定义按钮；保存后生成 TCID |
| `/route`         | 路由管理                | 建 CUSTOM（手写页面）或 TABLE（TCID）路由，菜单即时生效 |
| `/user`          | 用户管理                | 子系统内的用户增删改、分配角色                          |
| `/role`          | 角色管理                | 勾选权限码                                              |
| `/dict`          | 业务字典                | 维护下拉选项（如订单状态）                              |
| `/preview/:tcid` | 表格预览                | 配完表不建路由也能先看效果                              |

### 1.2 子系统页面（运行时从数据库生成）

- 登录后调 `GET /api/routes/my` 拿到当前子系统里"当前用户能看到的菜单"
- `type=TABLE` → 挂载 `views/business/runtime/table-page.vue`，内部渲染 `<Table :tcid>`
- `type=CUSTOM` → 按 `componentPath` 从 `src/views` 里找到对应 `.vue` 文件加载
- 找不到文件时显示 `views/business/runtime/missing-page.vue`（提示页，不是白屏）

### 1.3 公用表格组件（最重要）

```
src/components/table/
├── index.vue      # 组件本体
├── types.ts       # 后端配置的 TS 类型
├── utils.ts       # 纯函数：插槽名、列筛选、搜索值序列化
└── utils.spec.ts  # vitest 单测（18 个用例）
```

#### props

| 名称         | 类型    | 必填 | 说明                                                                          |
| ------------ | ------- | ---- | ----------------------------------------------------------------------------- |
| `tcid`       | string  | ✅   | 表格配置编号，决定渲染哪张表                                                  |
| `pageSize`   | number  |      | 覆盖配置里的每页条数                                                          |
| `showSearch` | boolean |      | 是否显示搜索栏，默认 true                                                     |
| `height`     | string  |      | 固定表格高度（内部滚动），如 `"520px"`；传了它就以它为准，覆盖后台的界面配置  |
| `minHeight`  | string  |      | 最小高度，数据少/空表时不让表格塌下去，默认 `"320px"`；传了 `height` 时不生效 |

#### 插槽（自定义的关键）

| 插槽名            | 作用域                    | 说明                                               |
| ----------------- | ------------------------- | -------------------------------------------------- |
| `#action-<value>` | `{ row, action, reload }` | 接管配置里 `value=<value>` 的自定义按钮            |
| `#col-<字段名>`   | `{ row, column, value }`  | 接管某一列的渲染（也支持配置里自定义的 `slot` 名） |
| `#toolbar`        | `{ reload, config }`      | 表格右上角工具栏追加自己的按钮                     |

> **插槽名必须和配置里的 `value` 完全一致**（大小写敏感）。
> 配置里按钮 `value = "ship"` → 页面写 `#action-ship`。
> 名字对不上不会报错，只是按钮会走默认逻辑（弹一个"点击了 xxx"的提示），很难排查，所以务必对齐。

#### 界面配置（表格高度、弹框长宽）

表格多高、新增/编辑弹框多大，默认由「表格配置」页面里的「界面配置」JSON 决定，
不用改代码。默认值是：

```json
{
  "table": { "height": 700 },
  "form": { "dialog": { "width": 1200, "height": 960 } }
}
```

优先级：**组件 prop（`height`）> 后台界面配置 > 内置默认**。
后台的 `config` 允许为空（老数据都没配过），此时用 `DEFAULT_TABLE_UI_CONFIG`（在 `types.ts`）兜底，
所以以后加新的外观项不需要迁移历史数据。
弹框高度还会再和窗口高度取小值（实际是 `min(配置值, 100vh - 40px)`），小屏上不会顶出屏幕。

#### 事件与暴露方法

```ts
const tableRef = ref()

<Table
  ref="tableRef"
  tcid="TDEMOORDERS"
  @action="({ value, row, action }) => console.log(value, row)"
  @loaded="({ total }) => console.log('共', total, '条')"
/>

tableRef.value.reload()      // 重新拉配置 + 数据
tableRef.value.getConfig()   // 当前渲染配置
tableRef.value.getRows()     // 当前页数据
```

### 1.4 完整用法示例

`src/views/business/examples/demo-table.vue` 是可直接参考的模板：

```vue
<script setup lang="ts">
import Table from "@/components/table/index.vue";
import { tableDataApi } from "@/api";

const TCID = "TDEMOORDERS";

/** 接管「标记发货」按钮 */
async function handleShip({ row, reload }) {
  await tableDataApi.update(TCID, row.id, { status: "shipped" });
  reload();
}
</script>

<template>
  <Table :tcid="TCID">
    <!-- 自定义按钮：配置里 value = 'ship' -->
    <template #action-ship="{ row, reload }">
      <el-button link type="success" @click="handleShip({ row, reload })">标记发货</el-button>
    </template>

    <!-- 自定义单元格：把状态渲染成彩色标签 -->
    <template #col-status="{ value }">
      <el-tag>{{ value }}</el-tag>
    </template>
  </Table>
</template>
```

---

## 2. 技术栈

| 类别 | 选型                          | 说明                                                                |
| ---- | ----------------------------- | ------------------------------------------------------------------- |
| 框架 | Vue 3（`<script setup>`）     | Composition API                                                     |
| 构建 | Vite 5                        | 开发冷启动快，`import.meta.glob` 做动态页面加载                     |
| UI   | Element Plus 2.9              | 全量引入（见"注意事项"）                                            |
| 路由 | vue-router 4（**hash 模式**） | 部署不需要 Nginx 配 try_files 回退                                  |
| 状态 | Pinia                         | `stores/auth.ts` 登录态，`stores/menu.ts` 动态菜单                  |
| 请求 | axios                         | `api/request.ts` 统一拦截：token、X-System-Code、拆包装、401 跳登录 |
| 测试 | vitest                        | `npm test`，纯函数单测，不需要浏览器环境                            |

---

## 3. 目录结构

```
client/
├── src/
│   ├── main.ts                      # 入口：Element Plus / 图标 / Pinia / Router / 预加载动态路由
│   ├── App.vue
│   ├── api/
│   │   ├── request.ts               # axios 实例与拦截器
│   │   └── index.ts                 # 所有接口封装（authApi/systemApi/.../tableDataApi）
│   ├── components/table/            # ★ 公用表格组件
│   ├── constants/permissions.ts     # 权限码清单（与后端 constants.ts 对齐）
│   ├── layout/index.vue             # 左侧菜单 + 顶栏（含超管切换子系统）
│   ├── router/index.ts              # 静态路由 + 动态路由注册 + 全局守卫
│   ├── stores/                      # auth / menu
│   ├── styles/index.less
│   └── views/
│       ├── base/                    # 基本路由：代码里写死的静态路由页
│       │   ├── login/ dashboard/    # 登录、首页
│       │   └── system/ route/ user/ role/ dict/ table-config/
│       └── business/                # 业务菜单：数据库配出来的动态路由页
│           ├── runtime/             # table-page.vue（表格路由容器）、missing-page.vue
│           └── examples/demo-table.vue  # ★ 自定义页面 + 插槽示例
├── nginx.conf                       # 生产用 Nginx 配置（SPA + /api 反代）
├── Dockerfile
├── vite.config.ts                   # @ 别名、dev proxy（/api → 127.0.0.1:3000）
└── package.json
```

---

## 4. 启动方式

### 4.1 开发模式

```bash
cd client
npm install
npm run dev
```

- 访问 <http://localhost:5173>
- 接口请求 `/api/**` 会被 Vite 代理到 `http://127.0.0.1:3000`（见 `vite.config.ts` 的 `server.proxy`）
- 后端端口不是 3000：`VITE_PROXY_TARGET=http://127.0.0.1:3001 npm run dev`（Windows PowerShell 用 `$env:VITE_PROXY_TARGET=...`）
- **前提**：后端已启动、且数据库已跑过迁移和种子（见 `server/README.md`）

### 4.2 构建与预览

```bash
npm run build        # 先 vue-tsc 类型检查，通过后才 vite build，产物在 dist/
npm run typecheck    # 只做类型检查（等价于 vue-tsc --noEmit），最快发现问题
npm run preview      # 本地起个静态服务看构建产物（默认 4173 端口）
```

> ⚠️ **为什么要单独做类型检查**：`vite build` 用 esbuild，**只转译不检查类型**——
> 类型写错也能构建成功，只会在编辑器里飘红。所以 `build` 脚本是 `vue-tsc --noEmit && vite build`，
> 类型错误会让构建直接失败。改代码时先跑 `npm run typecheck` 比等构建快得多。

### 4.3 测试

```bash
npm test             # vitest run，18 个用例
```

### 4.4 npm scripts 速查

| 命令                | 作用                             |
| ------------------- | -------------------------------- |
| `npm run dev`       | 开发服务器（5173，带 /api 代理） |
| `npm run typecheck` | vue-tsc 类型检查（不产出文件）   |
| `npm run build`     | 类型检查 + 生产构建 → `dist/`    |
| `npm run preview`   | 预览构建产物                     |
| `npm test`          | vitest 单测                      |

---

## 5. 注意事项

1. **Element Plus 是全量引入**
   首屏 JS 约 1.27MB（gzip 411KB），构建会有一条"chunk 超过 500KB"的警告，属于预期。
   想优化就改成按需引入（`unplugin-vue-components` + `unplugin-auto-import`），但那是构建配置的改动，不是当前阶段的事。
   **不要**为了消警告去删 `main.ts` 里的全量引入，否则所有组件都会找不到。

2. **路由用 hash 模式（地址栏带 `#`）**
   好处：Nginx / 静态托管不需要配置"任何路径都返回 index.html"，少一个上线必踩的 404 坑。
   代价：URL 不好看。要换成 history 模式，记得同时改 `nginx.conf` 的 `try_files`。

3. **改后端地址只改两处**
   开发：`vite.config.ts` 的 proxy target（或 `VITE_PROXY_TARGET`）
   生产：`client/.env.production` 里的 `VITE_API_BASE`（同域部署可留空）

4. **`import.meta.glob` 是构建期收集的**
   自定义页面必须是 `src/views` 下真实存在的 `.vue` 文件。
   开发时新增文件 Vite 会自动感知；`npm run build` 之后新增的文件不会自动出现在产物里，必须重新构建。

5. **`return ElMessage.warning(...)` 会报类型错误**
   `ElMessage` 返回的是 `MessageHandler` 而不是 `void`，所以 `async function (): Promise<void>` 里
   `return ElMessage.warning('x')` 会红。正确写法是分开写：

   ```ts
   if (!form.name.trim()) {
     ElMessage.warning("请填写名称");
     return;
   }
   ```

6. **动态插槽的类型推断不了，用 `row` 而不是 `value`**
   `<Table>` 的列插槽名是 `col-<字段名>`，是运行时拼的，TypeScript 推断不出作用域名。
   所以自定义单元格时用 `#col-xxx="{ row }"` 读 `row.xxx`，别用 `{ value }`——
   运行时 `value` 是有的，但类型检查会报"Property 'value' does not exist"。
   按钮插槽 `#action-<value>` 不受影响（作用域名是固定的 `action`），可以用 `{ row, action, reload }`。

7. **前端隐藏按钮 ≠ 安全**
   权限判断在前端只是体验（不显示不能点的按钮）。
   真正的拦截在后端守卫，前端改代码也绕不过去。

8. **权限码两份清单要同步**
   `client/src/constants/permissions.ts` 和后端 `server/src/common/constants.ts` 的 `ALL_PERMISSIONS`。
   实际渲染角色编辑页时用的是后端接口 `/api/roles/permissions`，前端这份用于兜底和类型提示。

9. **刷新业务页面**
   动态路由在 `main.ts` 里会预加载（本地有 token 时），所以刷新 `/order/list` 不会掉回首页。
   如果菜单还没加载完就访问，路由守卫会再加载一次。

10. **切换子系统会整页刷新**
    顶栏切换"正在配置的子系统"是 `location.reload()`，因为动态路由、菜单、缓存都要重建。
    代价是几百毫秒，换来的是"绝不会串数据"。

---

## 6. 常见问题

**Q：打开页面白屏 / 菜单是空的**
A：按 F12 看 Console 和 Network：

- 401 → 登录过期，重新登录
- `/api/routes/my` 403/500 → 后端没起或数据库没初始化
- 动态路由没注册 → 确认当前子系统里配了路由

**Q：`<Table>` 显示"TCID 不存在或不属于当前子系统"**
A：三种可能：TCID 拼错；这张表配在别的子系统里（切错系统了）；配置已被删除。

**Q：自定义按钮点了没反应**
A：插槽名和配置里的 `value` 对不上。配置里是 `ship`，模板里必须写 `#action-ship`。

**Q：`npm run build` 报 `esbuild ... Access is denied`（Windows 某些受限环境）**
A：esbuild 用的是系统临时目录，被策略/杀软锁住了。把临时目录指到可写位置再构建：

```powershell
$env:TMP = (New-Item -ItemType Directory -Force .tmp).FullName
$env:TEMP = $env:TMP
npm run build
```

**Q：`npm install` 报 `EPERM ... \_cacache\`**
A：npm 默认缓存在用户目录，受限环境写不进去。把缓存指到项目内：

```bash
npm install --cache .npm-cache
```

---

## 7. 代码格式化

缩进 **2 空格**，其余风格由 Prettier 决定，不要在 `.vue` / `.ts` 里手写缩进。

```bash
cd ..            # 回到仓库根目录
npm install      # 只需一次，装根目录的开发期 Prettier
npm run format   # 格式化整个仓库
```

编辑器里开了 formatOnSave 的话，Ctrl+S 就是同一套规则，不会二次重排。

### 7.1 单文件组件（SFC）的硬约束

1. **块顺序固定：`<template>` → `<script setup>` → `<style>`**。新写/改写组件都按这个来，
   不要 script 在前（`App.vue` 这种极简组件也一样）。
2. **样式一律用 Less**：`<style lang="less" scoped>`。`less` 已经装好（`devDependencies`），
   不需要额外配置 Vite。
3. **颜色/圆角/阴影用变量**：共用值都在 `src/styles/variables.less`，组件里这样用：

   ```vue
   <style lang="less" scoped>
   @import "../styles/variables.less";

   .box {
     color: @text-main;
     border: 1px solid @border-light;
     border-radius: @radius;
   }
   </style>
   ```

   路径按组件位置调整（如 `src/views/base/login/index.vue` 深度多一层，是 `../../../styles/variables.less`）。

4. 全局样式只在 `src/styles/index.less` 里加，组件样式不要往外泄漏（`scoped` 记得写）。

---

## 8. 需求 002 新增内容（2026-10-19）

| 功能           | 位置                                             | 怎么用                                                           |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| 图标网格选择器 | `components/IconPicker/index.vue`                | `<IconPicker v-model="form.icon" />`，弹层一行 6 个图标、可搜索  |
| 权限树（角色） | `views/base/role/index.vue`                      | 「角色管理 → 编辑 → 权限」勾菜单和表格按钮，保存权限码数组       |
| 路由 JSON 配置 | `views/base/route/index.vue` + `router/index.ts` | 路由里填 JSON，CUSTOM 页面通过 `props.routeConfig` 接收          |
| 顶部页签       | `stores/tabs.ts` + `layout/TagsView.vue`         | 自动记录访问页面，支持切换/关闭/关闭其它/关闭全部                |
| 字段表单配置   | `views/base/table-config/index.vue`              | 字段行「表单配置」二级弹框：表单排序/显示/24 栅格/必填/校验      |
| 表单校验       | `components/table/validators.ts`                 | 内置 phone/email/idCard…，也可注册自定义校验器（能拿到整个表单） |

### 权限树的数据形状

后端 `GET /api/roles/permission-tree` 返回 `{ tree, keyMap }`：

- `tree` 直接给 `el-tree`（`node-key="key"`，`disabled` 的节点不可勾）
- `keyMap` 是「节点 key → 权限码」。保存时用它把勾选 key 映射回权限码（同一权限码可能挂在多个节点上）

### 表格字段新增属性（后端 `fields` JSON）

| 属性              | 含义                  | 默认             |
| ----------------- | --------------------- | ---------------- |
| `listSort`        | 列表列顺序            | 0                |
| `searchSort`      | 搜索栏顺序            | 0                |
| `formSort`        | 表单顺序              | 与 listSort 相同 |
| `formVisible`     | 表单里是否显示        | true             |
| `formSpan`        | 表单占宽（24 栅格制） | 24               |
| `rules.pattern`   | 校验正则（字符串）    | —                |
| `rules.message`   | 校验失败提示          | —                |
| `rules.validator` | 前端注册的校验器名字  | —                |

### 自定义校验器怎么写

```ts
// client/src/components/table/validators.ts（或自己的页面里）
registerValidator("endAfterStart", (value, formModel) => {
  if (formModel.start_date && value <= formModel.start_date) return "结束日期必须晚于开始日期";
  return null;
});
```

然后在「表格配置 → 字段 → 表单配置 → 自定义校验」里选 `endAfterStart`。
**不把 JS 存进数据库执行**，原因见 `docs/requirements/002-20261019-整理版.md` 第 3 节 ⑥。

---

## 9. 首页图表统计（需求 003）

首页 `views/base/dashboard/index.vue` 是 ECharts 看板，按「当前在哪个系统」自动切换：

| 视角   | 什么时候                         | 内容                                                                                                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主系统 | 超管且顶栏没切子系统             | 平台总览：子系统/用户/角色/路由/表格/业务行数 + 资源对比柱状图、表格配置分布饼图、平台新增用户趋势、用户分布饼图、资源构成饼图、资源排行堆叠柱图 |
| 子系统 | 普通用户，或超管切到了某个子系统 | 本系统：用户/角色/路由/表格/字典计数 + 各表数据量 Top10、角色用户饼图、各表数据量占比、新增用户折线、新增业务数据折线                            |

图表组件是 [EChart.vue](src/components/charts/EChart.vue)（`echarts/core` 按需引入 Bar/Line/Pie）：

```vue
<EChart :option="option" height="340px" />
```

它负责 init / `setOption` / `ResizeObserver` 自适应 / 卸载时 dispose，页面只管拼 option。
数据来自 `statsApi.overview()` / `statsApi.system()`（后端 `src/stats/`）。
**子系统视角不再有搭建步骤和连接状态**，只有图表。
