-- =============================================================================
-- 0001_init：初始化全部表结构
--
-- 注意：第一行 CREATE EXTENSION 是手工加进去的。
-- Prisma 生成的迁移不会包含 pgvector 扩展，但 sys_vector_document 表用了
-- vector(1024) 类型，扩展没装会直接建表失败。
-- 部署到新环境时，数据库账号需要有创建扩展的权限（一般是超级用户）。
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RouteType" AS ENUM ('CUSTOM', 'TABLE');

-- CreateTable
CREATE TABLE "sys_system" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER NOT NULL DEFAULT 1,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_system_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(128) NOT NULL,
    "nickname" VARCHAR(64),
    "status" INTEGER NOT NULL DEFAULT 1,
    "role_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_role" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_dict_type" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_dict_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_dict_item" (
    "id" UUID NOT NULL,
    "dict_type_id" UUID NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_dict_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_route" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "parent_id" UUID,
    "title" VARCHAR(64) NOT NULL,
    "path" VARCHAR(128) NOT NULL,
    "type" "RouteType" NOT NULL DEFAULT 'CUSTOM',
    "component_path" VARCHAR(255),
    "tcid" VARCHAR(32),
    "icon" VARCHAR(64),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "permission_code" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_table_config" (
    "id" UUID NOT NULL,
    "tcid" VARCHAR(32) NOT NULL,
    "system_id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "remark" VARCHAR(255),
    "physical_table" VARCHAR(64) NOT NULL,
    "fields" JSONB NOT NULL,
    "search_mode" VARCHAR(16) NOT NULL DEFAULT 'AND',
    "conditions" JSONB,
    "operations" JSONB NOT NULL,
    "custom_actions" JSONB NOT NULL,
    "page_size" INTEGER NOT NULL DEFAULT 20,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_table_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_vector_document" (
    "id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "source" VARCHAR(128) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_vector_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_system_code_key" ON "sys_system"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_system_id_username_key" ON "sys_user"("system_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "sys_role_system_id_code_key" ON "sys_role"("system_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_dict_type_system_id_code_key" ON "sys_dict_type"("system_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_dict_item_dict_type_id_value_key" ON "sys_dict_item"("dict_type_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "sys_route_system_id_path_key" ON "sys_route"("system_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "sys_table_config_tcid_key" ON "sys_table_config"("tcid");

-- CreateIndex
CREATE INDEX "sys_vector_document_system_id_idx" ON "sys_vector_document"("system_id");

-- AddForeignKey
ALTER TABLE "sys_user" ADD CONSTRAINT "sys_user_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "sys_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user" ADD CONSTRAINT "sys_user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sys_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role" ADD CONSTRAINT "sys_role_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "sys_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_dict_type" ADD CONSTRAINT "sys_dict_type_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "sys_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_dict_item" ADD CONSTRAINT "sys_dict_item_dict_type_id_fkey" FOREIGN KEY ("dict_type_id") REFERENCES "sys_dict_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_route" ADD CONSTRAINT "sys_route_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "sys_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_table_config" ADD CONSTRAINT "sys_table_config_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "sys_system"("id") ON DELETE CASCADE ON UPDATE CASCADE;



