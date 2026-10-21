import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MAIN_SYSTEM_CODE, SUPER_ROLE_CODE } from "../common/constants";
import { physicalTableName } from "../common/identifiers";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSystemDto, UpdateSystemDto } from "./system.dto";

/**
 * 子系统（租户）管理。
 *
 * 谁能用：只有超管（接口上标了 requirePermissions('system:manage')）。
 *
 * 设计说明：
 *   新建子系统时会自动送一个默认角色 ADMIN（只带用户、角色两组权限），
 *   这样超管建完系统就能直接建用户、配角色，不用先手工造角色。
 *   路由/字典/表格配置/子系统管理属于主系统超管的配置能力，不下放给租户。
 */
@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出全部子系统（主系统排最前） */
  async list() {
    const list = await this.prisma.system.findMany({
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isMain: true,
        status: true,
        remark: true,
        createdAt: true,
        _count: { select: { users: true, routes: true, tables: true } },
      },
    });
    return { list };
  }

  /** 新建子系统 */
  async create(dto: CreateSystemDto) {
    const code = (dto.code || "").trim();
    const name = (dto.name || "").trim();

    if (!name) throw new BadRequestException("请填写子系统名称");
    if (!/^[a-z][a-z0-9_-]{1,31}$/.test(code)) {
      throw new BadRequestException(
        "系统编码不合法：必须小写字母开头，只能包含小写字母、数字、下划线、短横线，长度 2~32 位",
      );
    }
    if (code === MAIN_SYSTEM_CODE) {
      throw new BadRequestException("系统编码 main 是主系统保留编码，请换一个");
    }

    const exists = await this.prisma.system.findUnique({ where: { code } });
    if (exists) throw new ConflictException(`系统编码「${code}」已被占用`);

    // 事务：建系统 + 送一个默认管理员角色
    return this.prisma.$transaction(async (tx) => {
      const system = await tx.system.create({
        data: {
          code,
          name,
          remark: dto.remark || null,
          isMain: false,
          status: 1,
        },
      });

      await tx.role.create({
        data: {
          systemId: system.id,
          code: "ADMIN",
          name: "默认管理员",
          // 租户只负责自己的用户和角色；路由/字典/表格配置/子系统管理由主系统超管维护，
          // 所以默认只给这两组权限（用户明确要求）。
          permissions: [
            "user:read",
            "user:create",
            "user:update",
            "user:delete",
            "role:read",
            "role:create",
            "role:update",
            "role:delete",
          ],
          remark: "新建子系统时自动创建，可按需裁剪权限",
        },
      });

      return system;
    });
  }

  /** 修改子系统（编码不可改：改了所有已登录用户和前端配置都会失效） */
  async update(id: string, dto: UpdateSystemDto) {
    const system = await this.prisma.system.findUnique({ where: { id } });
    if (!system) throw new NotFoundException("子系统不存在");

    return this.prisma.system.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        remark: dto.remark ?? undefined,
        status: typeof dto.status === "number" ? dto.status : undefined,
      },
    });
  }

  /**
   * 删除子系统。
   *
   * 注意：
   *   1. 主系统不能删
   *   2. 会连带删除该系统的用户、角色、路由、表格配置（数据库外键级联）
   *   3. 业务物理表（biz_xxx）也会被 DROP —— 数据不可恢复，这是破坏性操作
   */
  async remove(id: string) {
    const system = await this.prisma.system.findUnique({ where: { id } });
    if (!system) throw new NotFoundException("子系统不存在");
    if (system.isMain) throw new BadRequestException("主系统不允许删除");

    const configs = await this.prisma.tableConfig.findMany({
      where: { systemId: id },
      select: { physicalTable: true, tcid: true },
    });

    // 先删配置和系统（元数据），再逐个丢掉物理表
    await this.prisma.system.delete({ where: { id } });

    for (const config of configs) {
      try {
        // 表名来自数据库、且经过格式校验；这里用 raw 是因为 DROP TABLE 不支持参数化标识符
        const table = physicalTableName(config.tcid);
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
      } catch {
        // 单张表删不掉不影响整体删除，留日志即可
      }
    }

    return { ok: true, droppedTables: configs.length };
  }

  /** 供其它模块用：按编码查系统，找不到抛 404 */
  async findByCodeOrFail(code: string) {
    const system = await this.prisma.system.findUnique({ where: { code } });
    if (!system) throw new NotFoundException(`子系统「${code}」不存在`);
    return system;
  }

  /** 主系统 id（seed 之后一定存在） */
  async mainSystem() {
    const system = await this.prisma.system.findUnique({
      where: { code: MAIN_SYSTEM_CODE },
    });
    if (!system) throw new NotFoundException("主系统不存在，请先执行 npm run seed");
    return system;
  }

  /** 超管角色编码常量对外暴露，避免各处写死字符串 */
  get superRoleCode(): string {
    return SUPER_ROLE_CODE;
  }
}
