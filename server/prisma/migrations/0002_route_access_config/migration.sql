-- =============================================================================
-- 0002：路由增加「访问控制」与「注入给前端的 JSON 配置」
--
-- 背景（需求 002）：
--   1. 路由原来手填 permissionCode，意义不明确 → 改为 accessType：
--        PUBLIC = 登录即可见（默认，兼容老数据）
--        ROLE   = 需要在角色权限树里勾选该菜单（权限码为 menu:<routeId>）
--   2. 路由增加 config JSON，前端自定义页面可通过 props.routeConfig 接收，
--      不改代码就能调整页面行为（例如默认筛选值、标题、列宽等）。
--
-- 注意：permissionCode 字段保留不删——老角色里可能已配了权限码，删列会让人无从追溯。
-- =============================================================================

ALTER TABLE "sys_route"
    ADD COLUMN "access_type" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN "config" JSONB;
