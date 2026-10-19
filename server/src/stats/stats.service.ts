import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { physicalTableName } from "../common/identifiers";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { fillMissingDays, mergeDayCounts, topByCount } from "./stats.util";

/**
 * 首页统计服务。
 *
 * 两个视角：
 *   1. overview() —— 主系统首页（超管）：整个平台有多少子系统、用户、路由、表格，各子系统资源对比
 *   2. system()   —— 子系统首页：只看当前子系统自己的数据（用户/角色/路由/表格/字典 + 每张表的数据量 + 近 7 天新增用户）
 *
 * 数据隔离原则：
 *   - overview 只允许超管调用（跨子系统聚合属敏感信息）
 *   - system 必须按「本次请求实际操作的子系统」过滤，不能跨租户
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 主系统首页统计（平台总览）。
   *
   * 参数：
   *   user - 当前登录用户；不是超管直接 403
   *
   * 返回：
   *   {
   *     systems: { total, enabled },                 // 子系统总数 / 启用数
   *     totals: { users, roles, routes, tables, dicts, bizRows },  // 全平台计数，bizRows 是估算值
   *     perSystem: [{ code, name, isMain, users, routes, tables }] // 每个子系统的资源，给柱状图/饼图
   *   }
   */
  async overview(user: JwtUser) {
    // 平台总览会暴露其他租户的规模，只给超管
    if (!user.isSuper) {
      throw new ForbiddenException("只有超级管理员可以查看平台统计");
    }

    // 这些计数互不依赖，一起并发查，省往返时间
    const [systemTotal, systemEnabled, userTotal, roleTotal, routeTotal, tableTotal, dictTotal] = await Promise.all([
      this.prisma.system.count(),
      this.prisma.system.count({ where: { status: 1 } }),
      this.prisma.user.count(),
      this.prisma.role.count(),
      this.prisma.route.count(),
      this.prisma.tableConfig.count(),
      this.prisma.dictType.count(),
    ]);

    // 每个子系统的资源数量（_count 是 Prisma 的关联计数，不会把关联行全查出来）
    const systems = await this.prisma.system.findMany({
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      select: {
        code: true,
        name: true,
        isMain: true,
        _count: { select: { users: true, routes: true, tables: true } },
      },
    });

    // 业务数据总行数：表少时精确 count，表多时退回估算（见 sumBizRows 里的说明）
    const bizRows = await this.sumBizRows();

    // 平台近 7 天新增用户（所有子系统加一起），给折线图
    const userTrend = await this.platformUserTrend();

    return {
      systems: { total: systemTotal, enabled: systemEnabled },
      totals: {
        users: userTotal,
        roles: roleTotal,
        routes: routeTotal,
        tables: tableTotal,
        dicts: dictTotal,
        bizRows: bizRows.total,
        /** 业务行数是不是估算的（前端据此决定要不要标「估算」） */
        bizRowsEstimated: bizRows.estimated,
      },
      perSystem: systems.map((system) => ({
        code: system.code,
        name: system.name,
        isMain: system.isMain,
        users: system._count.users,
        routes: system._count.routes,
        tables: system._count.tables,
      })),
      userTrend,
    };
  }

  /**
   * 子系统首页统计（只统计当前子系统）。
   *
   * 参数：
   *   user     - 当前登录用户（这里只用来兜底，实际过滤靠 systemId）
   *   systemId - 本次请求实际操作的子系统 id（超管切换后就是被切换的子系统）
   *
   * 返回：
   *   {
   *     totals: { users, roles, routes, tables, dicts },
   *     tableRows: [{ tcid, name, count }],   // 每张业务表的数据量（Top 10）
   *     roleUsers: [{ name, count }],         // 各角色下的用户数（饼图）
   *     userTrend: [{ day, count }]           // 近 7 天新增用户（折线图，缺天补 0）
   *   }
   */
  async system(user: JwtUser, systemId: string) {
    // 普通用户只能看自己的系统；超管可以看被切换到的系统。
    // 正常情况下 SystemContextGuard 已经保证了这一点，这里再兜一层，避免将来改守卫时出漏洞。
    if (!user.isSuper && user.systemId !== systemId) {
      throw new ForbiddenException("不能查看其他子系统的统计");
    }

    const [userTotal, roleTotal, routeTotal, tableTotal, dictTotal] = await Promise.all([
      this.prisma.user.count({ where: { systemId } }),
      this.prisma.role.count({ where: { systemId } }),
      this.prisma.route.count({ where: { systemId } }),
      this.prisma.tableConfig.count({ where: { systemId } }),
      this.prisma.dictType.count({ where: { systemId } }),
    ]);

    const [tableRows, roleUsers, userTrend, dataTrend] = await Promise.all([
      this.countTableRows(systemId),
      this.countRoleUsers(systemId),
      this.userTrend(systemId),
      this.dataTrend(systemId),
    ]);

    return {
      totals: { users: userTotal, roles: roleTotal, routes: routeTotal, tables: tableTotal, dicts: dictTotal },
      tableRows,
      roleUsers,
      userTrend,
      dataTrend,
    };
  }

  /**
   * 统计所有业务表（biz_ 开头）的总行数。
   *
   * 两种策略：
   *   1. 表少（≤ 30 张）：逐张 count(*)，结果精确。管理后台的库一般就几十张表，这样最准。
   *   2. 表多（> 30 张）：逐张 count 会很慢，改用 PostgreSQL 的 reltuples 估算
   *      （它的统计信息，autovacuum / ANALYZE 之后更新，可能滞后）。
   *
   * 返回 { total, estimated }：estimated 为 true 时前端会标「估算」。
   *
   * 安全说明：
   *   表名来自 pg_class（数据库自己的元数据，不是用户输入），并且再用正则过滤一次，
   *   只允许 biz_ + 小写字母数字，避免把奇怪的名字拼进 SQL。
   */
  private async sumBizRows(): Promise<{ total: number; estimated: boolean }> {
    const tables = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT relname AS name
      FROM pg_class
      WHERE relkind = 'r' AND relname LIKE 'biz\_%'
      ORDER BY relname
    `;

    const names = tables.map((table) => table.name).filter((name) => /^biz_[a-z0-9]+$/.test(name));
    if (names.length === 0) return { total: 0, estimated: false };

    // 表不多：逐张精确数
    if (names.length <= 30) {
      let total = 0;
      for (const name of names) {
        try {
          const rows = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
            `SELECT count(*)::int AS count FROM "${name}"`,
          );
          total += Number(rows[0]?.count ?? 0);
        } catch (error) {
          this.logger.warn(`统计 ${name} 行数失败：${(error as Error).message}`);
        }
      }
      return { total, estimated: false };
    }

    // 表太多：用统计信息估算
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint | null }>>`
      SELECT COALESCE(SUM(GREATEST(reltuples, 0)), 0)::bigint AS total
      FROM pg_class
      WHERE relkind = 'r' AND relname LIKE 'biz\_%'
    `;
    return { total: Number(rows[0]?.total ?? 0), estimated: true };
  }

  /**
   * 统计当前系统每张业务表的数据量，按行数倒序取前 10，给柱状图用。
   *
   * 逻辑：
   *   1. 查出这个系统的所有表格配置（最多取 200 张，避免极端情况扫太多）
   *   2. 对每张表执行 count(*)；表可能还没建（配置刚建、DDL 失败），所以 try/catch 兜底记 0
   *   3. 排序取前 10
   */
  private async countTableRows(systemId: string): Promise<Array<{ tcid: string; name: string; count: number }>> {
    const configs = await this.prisma.tableConfig.findMany({
      where: { systemId },
      select: { tcid: true, name: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const rows: Array<{ tcid: string; name: string; count: number }> = [];
    for (const config of configs) {
      let count = 0;
      try {
        // 表名由 physicalTableName 生成并经过白名单校验（biz_ + 小写字母数字），不可能是用户输入
        const table = physicalTableName(config.tcid);
        const result = await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
          `SELECT count(*)::int AS count FROM "${table}"`,
        );
        count = Number(result[0]?.count ?? 0);
      } catch (error) {
        // 表不存在（配置存在但物理表没建成）时不要让整个首页挂掉
        this.logger.warn(`统计表 ${config.tcid} 行数失败：${(error as Error).message}`);
      }
      rows.push({ tcid: config.tcid, name: config.name, count });
    }

    return topByCount(rows, 10);
  }

  /**
   * 统计当前系统各角色下的用户数，给饼图用。
   * 没有用户的角色也返回（count 为 0），前端图例更完整。
   */
  private async countRoleUsers(systemId: string): Promise<Array<{ name: string; count: number }>> {
    const roles = await this.prisma.role.findMany({
      where: { systemId },
      select: { name: true, _count: { select: { users: true } } },
      orderBy: { createdAt: "asc" },
    });

    return roles.map((role) => ({ name: role.name, count: role._count.users }));
  }

  /**
   * 近 7 天每天新增用户数（折线图）。
   * 数据库只会返回"有人注册的日期"，缺的天数用 fillMissingDays 补 0。
   */
  private async userTrend(systemId: string): Promise<Array<{ day: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(created_at::date, 'MM-DD') AS day, count(*)::int AS count
      FROM sys_user
      WHERE system_id = ${systemId}::uuid
        AND created_at >= now() - interval '6 days'
      GROUP BY 1
    `;
    return fillMissingDays(rows, 7);
  }

  /**
   * 主系统视角：全平台近 7 天每天新增用户数（不按子系统过滤）。
   */
  private async platformUserTrend(): Promise<Array<{ day: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT to_char(created_at::date, 'MM-DD') AS day, count(*)::int AS count
      FROM sys_user
      WHERE created_at >= now() - interval '6 days'
      GROUP BY 1
    `;
    return fillMissingDays(rows, 7);
  }

  /**
   * 子系统视角：近 7 天每天新增的**业务数据行数**（所有业务表加一起）。
   *
   * 逻辑：
   *   1. 取这个系统的表格配置（最多 20 张，避免首页查太多表）
   *   2. 每张表按 created_at 的日期 group by，得到「这张表每天新增几行」
   *   3. 用 mergeDayCounts 把多张表同一天的数字累加
   *   4. 再用 fillMissingDays 补成连续 7 天
   *
   * 注意：
   *   业务表都是 DDL 服务建的，统一带 created_at 列；万一某张表结构异常，
   *   单表查询失败只记日志、跳过这张表，不影响整个首页。
   */
  private async dataTrend(systemId: string): Promise<Array<{ day: string; count: number }>> {
    const configs = await this.prisma.tableConfig.findMany({
      where: { systemId },
      select: { tcid: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const groups: Array<Array<{ day: string; count: number }>> = [];
    for (const config of configs) {
      try {
        const table = physicalTableName(config.tcid);
        const rows = await this.prisma.$queryRawUnsafe<Array<{ day: string; count: number }>>(
          `SELECT to_char(created_at::date, 'MM-DD') AS day, count(*)::int AS count
           FROM "${table}"
           WHERE created_at >= now() - interval '6 days'
           GROUP BY 1`,
        );
        groups.push(rows);
      } catch (error) {
        this.logger.warn(`统计表 ${config.tcid} 的新增趋势失败：${(error as Error).message}`);
      }
    }

    return fillMissingDays(mergeDayCounts(groups), 7);
  }
}
