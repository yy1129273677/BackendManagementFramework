import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ALL_PERMISSIONS, SUPER_ROLE_CODE } from "../common/constants";
import { PrismaService } from "../prisma/prisma.service";
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

  /** 可分配的权限码清单（前端角色编辑页用来渲染勾选框） */
  permissions() {
    return {
      list: ALL_PERMISSIONS,
      groups: [...new Set(ALL_PERMISSIONS.map((item) => item.group))],
    };
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
   * 过滤掉不在白名单里的权限码。
   * 目的：防止前端传 'root' 之类的假权限码进数据库，导致后面判断口径混乱。
   */
  private normalizePermissions(input?: string[]): string[] {
    if (!Array.isArray(input)) return [];
    const allowed = new Set(ALL_PERMISSIONS.map((item) => item.code));
    return [...new Set(input.filter((code) => typeof code === "string" && allowed.has(code)))];
  }
}
