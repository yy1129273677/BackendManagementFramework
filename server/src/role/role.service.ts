import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ALL_PERMISSIONS, SUPER_ROLE_CODE } from "../common/constants";
import { PrismaService } from "../prisma/prisma.service";
import { availableFunctions, buildPermissionTree } from "./permission-tree";
import { CreateRoleDto, UpdateRoleDto } from "./role.dto";

/**
 * 角色管理（按子系统隔离）。
 *
 * 角色 = 一堆权限码的集合。用户绑定角色后，登录时把权限码签进 token，
 * 后端守卫按权限码放行，前端按权限码决定菜单和按钮显不显示。
 */
@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  /** 角色列表（带上每个角色下有几个用户） */
  async list(systemId: string) {
    const list = await this.prisma.role.findMany({
      where: { systemId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { users: true } } },
    });
    return { list };
  }

  /** 可分配的权限码清单（老接口，保留给需要平铺列表的场景） */
  permissions() {
    return {
      list: ALL_PERMISSIONS,
      groups: [...new Set(ALL_PERMISSIONS.map((item) => item.group))],
    };
  }

  /**
   * 权限树（角色编辑页用它替代原来那一排看不懂的权限码勾选框）。
   *
   * 树的结构：
   *   系统功能 —— 子系统/用户/角色/字典/表格配置等管理能力
   *   菜单与按钮 —— 当前子系统的真实路由；TABLE 路由下面挂这张表的按钮权限
   *
   * 注意：子系统（租户）只展示「用户」「角色」两组系统功能。
   * 路由/字典/表格配置/子系统管理都由主系统超管维护，租户角色里不应出现（用户明确要求）。
   *
   * 返回 keyMap：el-tree 勾选的是节点 key，保存时要按 keyMap 映射回权限码
   * （同一个权限码可能出现在多个节点上，所以 key 必须唯一）。
   */
  async permissionTree(systemId: string) {
    const [system, routes, tableConfigs] = await Promise.all([
      this.prisma.system.findUnique({ where: { id: systemId }, select: { isMain: true } }),
      this.prisma.route.findMany({
        where: { systemId },
        orderBy: [{ sort: "asc" }, { title: "asc" }],
        select: {
          id: true,
          parentId: true,
          title: true,
          type: true,
          tcid: true,
          sort: true,
          accessType: true,
          // 自定义页面的内嵌表格声明在 config.tcids 里（权限树要读它生成说明）
          config: true,
        },
      }),
      this.prisma.tableConfig.findMany({
        where: { systemId },
        select: { tcid: true, name: true, operations: true, customActions: true, readScope: true },
      }),
    ]);

    return buildPermissionTree({
      routes: routes as any,
      tableConfigs: tableConfigs as any,
      functions: availableFunctions(Boolean(system?.isMain)),
    });
  }

  /** 新建角色 */
  async create(systemId: string, dto: CreateRoleDto) {
    const code = (dto.code || "").trim().toUpperCase();
    const name = (dto.name || "").trim();

    if (!name) throw new BadRequestException("请填写角色名称");
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) {
      throw new BadRequestException("角色编码不合法：大写字母开头，2~32 位大写字母/数字/下划线");
    }
    if (code === SUPER_ROLE_CODE) {
      throw new BadRequestException("SUPER_ADMIN 是系统保留角色编码");
    }

    const exists = await this.prisma.role.findFirst({
      where: { systemId, code },
    });
    if (exists) throw new ConflictException(`角色编码「${code}」已存在`);

    return this.prisma.role.create({
      data: {
        systemId,
        code,
        name,
        permissions: this.normalizePermissions(dto.permissions),
        remark: dto.remark || null,
      },
    });
  }

  /** 修改角色（编码不可改，改了已登录用户权限会立刻对不上） */
  async update(systemId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id, systemId } });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.code === SUPER_ROLE_CODE) {
      throw new BadRequestException("超管角色不允许修改，请直接改代码里的常量");
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        permissions: dto.permissions ? this.normalizePermissions(dto.permissions) : undefined,
        remark: dto.remark ?? undefined,
      },
    });
  }

  /** 删除角色。角色下还有用户时拒绝删除，避免把人踢成无权限状态 */
  async remove(systemId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, systemId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException("角色不存在");
    if (role.code === SUPER_ROLE_CODE) throw new BadRequestException("超管角色不允许删除");
    if (role._count.users > 0) {
      throw new BadRequestException(`该角色下还有 ${role._count.users} 个用户，请先解除绑定再删除`);
    }

    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * 规范化权限码数组。
   *
   * 为什么不再用「固定白名单」：
   *   需求 002 之后权限码是动态生成的，不止 ALL_PERMISSIONS 里那几个：
   *     - 菜单权限：menu:<routeId>
   *     - 表格按钮：data:create:<tcid> / data:action:<tcid>:<value>
   *   固定白名单会把这些全部过滤掉（踩过一次：角色保存后权限为空，菜单和按钮都不生效）。
   *
   * 现在改成「格式校验」：只允许字母开头、字母数字下划线冒号短横线，长度有限制。
   * 这样既能挡住空格/引号这类脏数据，又不会误杀动态权限码。
   */
  private normalizePermissions(input?: string[]): string[] {
    if (!Array.isArray(input)) return [];

    const allowedPattern = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/;
    return [
      ...new Set(input.filter((code) => typeof code === "string" && (code === "*" || allowedPattern.test(code)))),
    ];
  }
}
