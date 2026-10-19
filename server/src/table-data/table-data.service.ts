import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { physicalTableName } from "../common/identifiers";
import { hasPermission } from "../common/permissions";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { TableConfigService } from "../table-config/table-config.service";
import { TableField, TableOperations } from "../table-config/table-field.types";
import { buildWhereClause } from "./search-builder";

/** 查询参数 */
export interface QueryParams {
  page?: string | number;
  pageSize?: string | number;
  /** JSON 字符串形式的搜索条件 */
  filters?: string;
}

/** 校验 id 是不是 uuid，避免非法值传到 SQL 里变成 500 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 动态表格数据服务 —— 前端 <Table> 组件真正调用的接口。
 *
 * 它不写死在代码里，而是「读配置 → 拼 SQL → 执行」：
 *   同一个接口 /api/table/:tcid/data 能服务任意一张表，
 *   因为表名、字段、权限全部来自 TCID 对应的那份配置。
 *
 * 安全约定：
 *   表名来自 TCID（固定格式 + 白名单校验），列名来自配置（入库前校验过），
 *   搜索值全部参数化，id 强制 uuid 格式。
 */
@Injectable()
export class TableDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: TableConfigService,
  ) {}

  /** 前端渲染配置（哪些列、哪些搜索项、哪些按钮） */
  async renderConfig(systemId: string, tcid: string, user: JwtUser) {
    return this.configService.renderConfig(systemId, tcid, user);
  }

  /**
   * 分页查询。
   *
   * 参数：
   *   systemId - 当前子系统 id（隔离用）
   *   tcid     - 表格编号
   *   params   - page / pageSize / filters（filters 是 JSON 字符串）
   *
   * 返回：
   *   { list, total, page, pageSize }
   */
  async query(systemId: string, tcid: string, params: QueryParams) {
    const config = await this.configService.getByTcid(systemId, tcid);
    const fields = (config.fields || []) as unknown as TableField[];

    // 每页条数：请求值优先，但不能超过 200
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || Number(config.pageSize) || 20));

    // 解析搜索条件（JSON 字符串），解析失败给一句人话，别抛 500
    let payload: any = null;
    if (params.filters) {
      try {
        payload = JSON.parse(params.filters);
      } catch {
        throw new BadRequestException("搜索条件格式不正确（需要 JSON）");
      }
    }

    let where: Prisma.Sql;
    try {
      where = buildWhereClause(payload, fields, config.searchMode);
    } catch (error) {
      // 搜索条件里的字段/运算符不合法，属于用户输入问题 → 400
      throw new BadRequestException((error as Error).message);
    }

    const table = physicalTableName(config.tcid);
    const offset = (page - 1) * pageSize;

    const list = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`SELECT * FROM ${Prisma.raw(table)} ${where} ORDER BY "created_at" DESC LIMIT ${pageSize} OFFSET ${offset}`,
    );

    const counted = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT count(*)::int AS count FROM ${Prisma.raw(table)} ${where}`,
    );

    return {
      list: list.map((row) => this.toPlainRow(row)),
      total: Number(counted[0]?.count || 0),
      page,
      pageSize,
    };
  }

  /**
   * 新增一条数据。
   *
   * 校验：
   *   1. 该表格是否开放新增
   *   2. 当前用户有没有新增权限
   *   3. 必填字段是否都填了
   *   4. 只接受配置里 editable 的字段（防止绕过表单写隐藏字段）
   */
  async create(systemId: string, tcid: string, user: JwtUser, body: Record<string, any>) {
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "create");

    const fields = (config.fields || []) as unknown as TableField[];
    const editable = fields.filter((field) => field.editable !== false);

    const columns: TableField[] = [];
    const values: any[] = [];

    for (const field of editable) {
      const value = body?.[field.name];
      if (value === undefined || value === null || value === "") {
        if (field.required) {
          throw new BadRequestException(`字段「${field.label || field.name}」是必填项`);
        }
        continue;
      }
      columns.push(field);
      values.push(this.normalizeValue(field, value));
    }

    const table = physicalTableName(config.tcid);

    // 一个字段都没填 → 插入一行全空记录（数据库层面允许，方便做占位）
    if (columns.length === 0) {
      const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
        Prisma.sql`INSERT INTO ${Prisma.raw(table)} DEFAULT VALUES RETURNING *`,
      );
      return this.toPlainRow(rows[0]);
    }

    const columnSql = Prisma.join(columns.map((field) => Prisma.raw(`"${field.name}"`)));
    const valueSql = Prisma.join(columns.map((field, index) => this.valueFragment(field, values[index])));

    const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`INSERT INTO ${Prisma.raw(table)} (${columnSql}) VALUES (${valueSql}) RETURNING *`,
    );
    return this.toPlainRow(rows[0]);
  }

  /** 修改一条数据（只改传了的、且允许编辑的字段） */
  async update(systemId: string, tcid: string, id: string, user: JwtUser, body: Record<string, any>) {
    this.assertUuid(id);
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "update");

    const fields = (config.fields || []) as unknown as TableField[];
    const editable = fields.filter((field) => field.editable !== false);

    const assignments: Prisma.Sql[] = [];
    for (const field of editable) {
      if (!body || body[field.name] === undefined) continue;
      const value = this.normalizeValue(field, body[field.name]);
      assignments.push(Prisma.sql`${Prisma.raw(`"${field.name}"`)} = ${this.valueFragment(field, value)}`);
    }

    if (assignments.length === 0) {
      throw new BadRequestException("没有可修改的字段");
    }

    const table = physicalTableName(config.tcid);
    const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`UPDATE ${Prisma.raw(table)}
                       SET ${Prisma.join(assignments)}, "updated_at" = now()
                       WHERE "id" = ${id}::uuid
                       RETURNING *`,
    );

    if (!rows || rows.length === 0) throw new NotFoundException("要修改的数据不存在");
    return this.toPlainRow(rows[0]);
  }

  /** 删除一条数据 */
  async remove(systemId: string, tcid: string, id: string, user: JwtUser) {
    this.assertUuid(id);
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "delete");

    const table = physicalTableName(config.tcid);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE "id" = ${id}::uuid RETURNING "id"`,
    );

    if (!rows || rows.length === 0) throw new NotFoundException("要删除的数据不存在");
    return { ok: true, id };
  }

  /**
   * 判断当前用户能不能做某个操作。
   *
   * 两个条件同时满足才行：
   *   1. 表格配置里这个操作是开启的
   *   2. 用户有配置里指定的权限码（默认 data:create / data:update / data:delete）
   */
  private assertOperation(user: JwtUser, operations: TableOperations, action: "create" | "update" | "delete"): void {
    const labels = { create: "新增", update: "修改", delete: "删除" };
    if (operations[action] === false) {
      throw new ForbiddenException(`该表格已关闭${labels[action]}操作`);
    }
    const permission = operations[`${action}Permission`];
    if (permission && !hasPermission(user?.permissions, Boolean(user?.isSuper), permission)) {
      throw new ForbiddenException(`没有${labels[action]}权限（需要 ${permission}）`);
    }
  }

  /** id 必须是 uuid，否则数据库会抛类型错误，用户体验很差 */
  private assertUuid(id: string): void {
    if (!UUID_PATTERN.test(String(id || ""))) {
      throw new BadRequestException("数据 id 格式不正确");
    }
  }

  /** 按字段类型整理值：空字符串当 null，数字转数字，布尔转布尔 */
  private normalizeValue(field: TableField, value: any): any {
    if (value === "" || value === undefined) return null;
    if (value === null) return null;

    switch (field.type) {
      case "number":
      case "integer": {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new BadRequestException(`字段「${field.label || field.name}」需要数字`);
        }
        return field.type === "integer" ? Math.trunc(numberValue) : numberValue;
      }
      case "boolean":
        return value === true || value === "true" || value === 1 || value === "1";
      case "json":
        return typeof value === "string" ? value : JSON.stringify(value);
      default:
        return String(value);
    }
  }

  /**
   * 生成一个参数化占位符片段。
   * jsonb 需要显式 cast，否则 PostgreSQL 不知道该把字符串转成 json 还是 text。
   */
  private valueFragment(field: TableField, value: any): Prisma.Sql {
    if (field.type === "json" && value !== null) {
      return Prisma.sql`${value}::jsonb`;
    }
    return Prisma.sql`${value}`;
  }

  /**
   * 把数据库返回的行转成能安全 JSON 化的普通对象。
   * PostgreSQL 的 timestamptz 会被驱动转成 Date，numeric 会转成 Decimal，
   * 直接返回给前端时格式不好看，这里统一处理。
   */
  private toPlainRow(row: Record<string, any>): Record<string, any> {
    const plain: Record<string, any> = {};
    for (const [key, value] of Object.entries(row || {})) {
      if (value instanceof Date) {
        plain[key] = value.toISOString();
      } else if (value && typeof value === "object" && typeof (value as any).toNumber === "function") {
        // Prisma Decimal
        plain[key] = Number(value);
      } else {
        plain[key] = value;
      }
    }
    return plain;
  }
}
