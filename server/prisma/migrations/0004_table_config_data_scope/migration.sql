-- 表级数据范围（行级隔离）
--
-- read_scope  : ALL = 全系统可见；OWN = 仅创建人可见（超管 / data:viewAll 权限例外）
-- write_scope : ALL = 有修改权限即可改所有行；OWN = 只能改自己创建的行
--
-- 默认 ALL，保证已有表格的行为不变；业务物理表需要补 created_by 列，
-- 用脚本 npm run migrate:003 单独执行（物理表是运行时动态创建的，不在 Prisma 迁移里）。

ALTER TABLE "sys_table_config"
  ADD COLUMN IF NOT EXISTS "read_scope"  VARCHAR(8) NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "write_scope" VARCHAR(8) NOT NULL DEFAULT 'ALL';
