import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { physicalTableName } from "../common/identifiers";
import { hasPermission } from "../common/permissions";
import { JwtUser } from "../common/types";
import { resolveDataScope } from "../common/data-scope";
import { PrismaService } from "../prisma/prisma.service";
import { TableConfigService } from "../table-config/table-config.service";
import { TableField, TableOperations, pgParamCast } from "../table-config/table-field.types";
import { hasRouteScopedPermission } from "../common/permission-scope";
import { canReadTable } from "./read-access";
import { buildWhereClause } from "./search-builder";
import { declaredTcids } from "../route/route-tcids";

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
  async renderConfig(systemId: string, tcid: string, user: JwtUser, routeId?: string) {
    // 连「渲染配置」都要先确认能看这张表，否则未授权用户能拿到字段定义
    await this.assertCanReadTable(systemId, tcid, user);
    // routeId 用来判断「这个路由下的按钮权限」（按路由区分，见 common/permission-scope.ts）
    return this.configService.renderConfig(systemId, tcid, user, routeId);
  }

  /**
   * 校验「当前用户能不能读这张表的数据」。
   *
   * 规则（用户要求）：**勾了这张表对应的菜单 → 就能读**，
   * 不再要求单独勾一个「读取表格数据（所有表）」的全局权限码。
   *
   * 具体判断交给纯函数 canReadTable（有单测），这里只负责查「这张表绑了哪些菜单」。
   * 老角色上残留的全局 data:read 仍然放行（兼容需求 002 之前的配置）。
   */
  private async assertCanReadTable(systemId: string, tcid: string, user: JwtUser): Promise<void> {
    if (canReadTable([], user.permissions || [], Boolean(user.isSuper))) return;

    // 1) 直接绑这张表的菜单（TABLE 路由）
    const tableRoutes = await this.prisma.route.findMany({
      where: { systemId, tcid },
      select: { id: true, accessType: true, visible: true },
    });

    // 2) 自定义页面在 JSON 配置里声明了内嵌这张表（config.tcids）：
    //    勾了自定义页面的菜单，页面里的表格也应该能读。
    const customRoutes = await this.prisma.route.findMany({
      where: { systemId, type: "CUSTOM" },
      select: { id: true, accessType: true, visible: true, config: true },
    });
    const embeddedRoutes = customRoutes.filter((route) => declaredTcids(route.config).includes(tcid));

    if (canReadTable([...tableRoutes, ...embeddedRoutes], user.permissions || [], Boolean(user.isSuper))) return;

    throw new ForbiddenException("没有查看这张表的权限：请让管理员在角色里勾选对应的菜单");
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
  async query(systemId: string, tcid: string, params: QueryParams, user: JwtUser, routeId?: string) {
    // 先确认「能看这张表」：勾了对应菜单即可，不再依赖全局 data:read
    await this.assertCanReadTable(systemId, tcid, user);

    const config = await this.configService.getByTcid(systemId, tcid);
    const fields = (config.fields || []) as unknown as TableField[];

    // 行级读范围：OWN 时只返回自己创建的行（超管 / data:viewAll 例外）
    const scope = resolveDataScope({
      readScope: config.readScope,
      writeScope: config.writeScope,
      tcid: config.tcid,
      isSuper: Boolean(user.isSuper),
      permissions: user.permissions,
      routeId,
    });

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

    // 行级隔离条件必须和用户搜索条件「与」在一起，不能覆盖原条件
    if (!scope.readAll) {
      const owner = Prisma.sql`"created_by" = ${user.sub}::uuid`;
      where = where.sql ? Prisma.sql`${where} AND ${owner}` : Prisma.sql`WHERE ${owner}`;
    }

    const table = physicalTableName(config.tcid);
    const offset = (page - 1) * pageSize;

    const list = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`SELECT * FROM ${Prisma.raw(table)} ${where} ORDER BY "created_at" DESC LIMIT ${pageSize} OFFSET ${offset}`,
    );

    const counted = await this.prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT count(*)::int AS count FROM ${Prisma.raw(table)} ${where}`,
    );

    const plainList = list.map((row) => this.toPlainRow(row));

    // 「创建人」只在能看到别人数据时才有意义：
    // 读范围 ALL（含超管 / viewAll）或写范围 ALL 时补上名字；
    // 读写都是 OWN 时列表里只有自己的数据，展示创建人没有信息量。
    if (scope.readAll || scope.writeAll) {
      await this.attachCreatorNames(systemId, plainList);
    }

    return {
      list: plainList,
      total: Number(counted[0]?.count || 0),
      page,
      pageSize,
    };
  }

  /**
   * 给列表补「创建人名称」。
   *
   * created_by 存的是用户 uuid，直接展示对用户没有意义；这里批量换一次名字。
   * 历史数据（created_by 为 null）或创建人已被删除时保持 null，前端显示「—」。
   */
  private async attachCreatorNames(systemId: string, rows: Array<Record<string, any>>): Promise<void> {
    const ids = [
      ...new Set(rows.map((row) => row.created_by).filter((id): id is string => typeof id === "string" && !!id)),
    ];
    if (ids.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { systemId, id: { in: ids } },
      select: { id: true, username: true, nickname: true },
    });
    const nameMap = new Map(users.map((user) => [user.id, user.nickname || user.username]));

    for (const row of rows) {
      row.creatorName = row.created_by ? (nameMap.get(row.created_by) ?? null) : null;
    }
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
  async create(systemId: string, tcid: string, user: JwtUser, body: Record<string, any>, routeId?: string) {
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "create", routeId);

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
    // 固定列 created_by 由服务端写入，body 里就算传了也不会被采纳（可编辑字段来自配置白名单）
    const creatorSql = Prisma.sql`${user.sub}::uuid`;

    // 一个字段都没填 → 插入一行全空记录（数据库层面允许，方便做占位）
    if (columns.length === 0) {
      const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
        Prisma.sql`INSERT INTO ${Prisma.raw(table)} ("created_by") VALUES (${creatorSql}) RETURNING *`,
      );
      return this.toPlainRow(rows[0]);
    }

    const columnSql = Prisma.join([
      Prisma.raw(`"created_by"`),
      ...columns.map((field) => Prisma.raw(`"${field.name}"`)),
    ]);
    const valueSql = Prisma.join([
      creatorSql,
      ...columns.map((field, index) => this.valueFragment(field, values[index])),
    ]);

    const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`INSERT INTO ${Prisma.raw(table)} (${columnSql}) VALUES (${valueSql}) RETURNING *`,
    );
    return this.toPlainRow(rows[0]);
  }

  /** 修改一条数据（只改传了的、且允许编辑的字段） */
  async update(systemId: string, tcid: string, id: string, user: JwtUser, body: Record<string, any>, routeId?: string) {
    this.assertUuid(id);
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "update", routeId);

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
    // 行级写范围：OWN 时只能改自己创建的行；改别人的行影响 0 行 → 404，不暴露记录是否存在
    const scope = resolveDataScope({
      readScope: config.readScope,
      writeScope: config.writeScope,
      tcid: config.tcid,
      isSuper: Boolean(user.isSuper),
      permissions: user.permissions,
      routeId,
    });
    const owner = scope.writeAll ? Prisma.empty : Prisma.sql`AND "created_by" = ${user.sub}::uuid`;

    const rows = await this.prisma.$queryRaw<Array<Record<string, any>>>(
      Prisma.sql`UPDATE ${Prisma.raw(table)}
                       SET ${Prisma.join(assignments)}, "updated_at" = now()
                       WHERE "id" = ${id}::uuid ${owner}
                       RETURNING *`,
    );

    if (!rows || rows.length === 0) throw new NotFoundException("要修改的数据不存在");
    return this.toPlainRow(rows[0]);
  }

  /** 删除一条数据 */
  async remove(systemId: string, tcid: string, id: string, user: JwtUser, routeId?: string) {
    this.assertUuid(id);
    const config = await this.configService.getByTcid(systemId, tcid);
    const operations = (config.operations || {}) as TableOperations;
    this.assertOperation(user, operations, "delete", routeId);

    const table = physicalTableName(config.tcid);
    // 行级写范围：OWN 时只能删自己创建的行
    const scope = resolveDataScope({
      readScope: config.readScope,
      writeScope: config.writeScope,
      tcid: config.tcid,
      isSuper: Boolean(user.isSuper),
      permissions: user.permissions,
      routeId,
    });
    const owner = scope.writeAll ? Prisma.empty : Prisma.sql`AND "created_by" = ${user.sub}::uuid`;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE "id" = ${id}::uuid ${owner} RETURNING "id"`,
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
  private assertOperation(
    user: JwtUser,
    operations: TableOperations,
    action: "create" | "update" | "delete",
    routeId?: string,
  ): void {
    const labels = { create: "新增", update: "修改", delete: "删除" };
    if (operations[action] === false) {
      throw new ForbiddenException(`该表格已关闭${labels[action]}操作`);
    }
    const permission = operations[`${action}Permission`];
    // 按路由区分：认「当前路由的权限码」或老的基础码（所有路由通用）
    if (!hasRouteScopedPermission(user?.permissions, Boolean(user?.isSuper), permission, routeId)) {
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
   *
   * 干什么：
   *   把「要写入的值」变成 SQL 里的一个参数（$1、$2…），必要时补上类型转换。
   *
   * 为什么有些类型要补 ::date / ::timestamptz / ::jsonb：
   *   Prisma 参数化时把 JS 字符串当成 text 类型发给数据库，
   *   PostgreSQL 不会自动把 text 转成日期类型，于是写日期字段会报
   *     column "paid_time" is of type date but expression is of type text
   *   结果就是接口 500。补上转换后，数据库才知道「这个参数按日期解释」。
   *   转换类型来自 pgParamCast 的固定白名单，值本身仍是参数绑定，没有注入面。
   */
  private valueFragment(field: TableField, value: any): Prisma.Sql {
    switch (pgParamCast(field.type)) {
      case "date":
        return Prisma.sql`${value}::date`;
      case "timestamptz":
        return Prisma.sql`${value}::timestamptz`;
      case "jsonb":
        return Prisma.sql`${value}::jsonb`;
      default:
        return Prisma.sql`${value}`;
    }
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
