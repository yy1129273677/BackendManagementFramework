# 文档索引

> 这套文档遵循「文档即代码（docs as code）」：和代码放同一个仓库、同一个 PR 一起改，
> 目的只有一个——**图和文档不要过期**。

## 怎么读

| 你的角色             | 从这里开始                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| 第一次接触这个项目   | `docs/glossary.md`（术语）→ `docs/design/01-context.md`（要解决什么）    |
| 要部署上线           | 根目录 `DEPLOY.md`                                                       |
| 要改后端             | `server/README.md` → `docs/design/02-domain.md`、`06-failure.md`         |
| 要写前端自定义页面   | `client/README.md` → `client/src/views/business/examples/demo-table.vue` |
| 想知道为什么这么设计 | `docs/adr/0001-技术栈与TCID动态表格决策.md`                              |
| 想核对需求有没有实现 | `docs/requirements/`（001→003，每条需求一份整理版 + 实现对照）           |

## 目录

| 文件                                                  | 内容                                                      |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `glossary.md`                                         | 术语表：主系统 / 子系统 / TCID / 路由 / 字典 …            |
| `requirements/001-admin-framework.md`                 | 最初的需求原文整理 + 实现对照                             |
| `requirements/002-20261019-整理版.md`                 | 路由/权限树/页签/表单配置（含交付后微调记录）             |
| `requirements/003-20261019-首页图表统计.md`           | 首页 ECharts 统计（主系统平台总览、子系统图表看板）       |
| `requirements/004-20261019-自定义页面内嵌表格权限.md` | 自定义页面里 `<Table :tcid>` 的读权限与增删改按钮授权     |
| `design/01-context.md`                                | 背景、目标、非目标、约束、角色                            |
| `design/02-domain.md`                                 | 领域模型（mermaid ER 图）+ 实体与不变式                   |
| `design/03-flows.md`                                  | 关键流程（登录建系统、配表格拿 TCID、前端渲染、CRUD）     |
| `design/04-states.md`                                 | 状态与状态迁移（子系统、表格配置、业务数据）              |
| `design/05-rules.md`                                  | 业务规则决策表（权限矩阵、字段类型映射、搜索模式）        |
| `design/06-failure.md`                                | 失败模式与应对（DDL 失败、注入、并发、慢查询…）           |
| `design/07-security.md`                               | 后端安全基线：强制规则、现状缺口、工具链与人工三问        |
| `adr/0001-技术栈与TCID动态表格决策.md`                | 架构决策记录：技术栈、物理表 vs JSONB、为什么不开原始 SQL |
| `diagrams/README.md`                                  | 图放哪、为什么默认写在 markdown 里                        |

## 约定

1. **图用 Mermaid 写在 markdown 里**，不产出图片文件。原因：文本可 diff、可搜索、AI 和我都能逐字读。
2. **决策必须留记录**：任何「为什么不选另一个方案」的讨论，写进 `adr/`，不要只留在聊天记录里。
3. **需求文档由人写**（`requirements/`），设计文档可以人机共创（`design/`、`adr/`）。
4. 文档里的命令、路径、端口必须和代码一致；改了代码顺手改文档，否则文档比没有更糟。
