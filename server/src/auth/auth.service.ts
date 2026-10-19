import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { MAIN_SYSTEM_CODE, SUPER_ROLE_CODE } from "../common/constants";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto, LoginDto } from "./auth.dto";

/**
 * 认证服务：登录、查个人信息、改密码。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 登录。
   *
   * 干什么：
   *   1. 按系统编码找到子系统（不填默认主系统）
   *   2. 在该子系统内按用户名找用户
   *   3. bcrypt 比对密码
   *   4. 把用户信息 + 权限签进 token
   *
   * 参数：
   *   dto.username   - 用户名
   *   dto.password   - 明文密码
   *   dto.systemCode - 系统编码，可空
   *
   * 返回：
   *   { token, user: {...} }，前端把 token 存 localStorage
   *
   * 注意：
   *   账号不存在和密码错误返回同一句「账号或密码错误」，
   *   避免被人拿来试探哪些用户名存在（用户枚举漏洞）。
   */
  async login(dto: LoginDto) {
    if (!dto?.username || !dto?.password) {
      throw new BadRequestException("请输入用户名和密码");
    }

    const systemCode = (dto.systemCode || "").trim() || MAIN_SYSTEM_CODE;

    // 找子系统
    const system = await this.prisma.system.findUnique({
      where: { code: systemCode },
    });
    if (!system) {
      throw new BadRequestException(`系统编码「${systemCode}」不存在`);
    }
    if (system.status !== 1) {
      throw new ForbiddenException(`子系统「${system.name}」已停用，请联系管理员`);
    }

    // 在这个子系统里找用户（复合唯一键 systemId + username）
    const user = await this.prisma.user.findUnique({
      where: {
        systemId_username: { systemId: system.id, username: dto.username },
      },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException("账号或密码错误");
    }
    if (user.status !== 1) {
      throw new ForbiddenException("该账号已停用，请联系管理员");
    }

    const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException("账号或密码错误");
    }

    // 超管判定：主系统 + 角色编码是 SUPER_ADMIN
    const isSuper = system.isMain && user.role?.code === SUPER_ROLE_CODE;
    const permissions = user.role?.permissions || [];

    const payload: JwtUser = {
      sub: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      systemId: system.id,
      systemCode: system.code,
      isSuper,
      permissions,
      roleId: user.roleId || undefined,
    };

    const token = await this.jwt.signAsync(payload);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        systemId: system.id,
        systemCode: system.code,
        systemName: system.name,
        isSuper,
        permissions,
        roleId: user.roleId,
        roleName: user.role?.name || null,
      },
    };
  }

  /**
   * 查询当前登录用户的最新信息。
   *
   * 干什么：
   *   前端刷新页面后，token 还在但内存里的用户信息没了，
   *   用这个接口重新拉一次，顺便校验 token 是否还有效。
   *
   * 注意：
   *   这里查的是数据库最新状态，所以角色改名、权限调整后刷新页面就能看到。
   */
  async profile(user: JwtUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: { role: true, system: true },
    });
    if (!dbUser) throw new UnauthorizedException("用户不存在，请重新登录");

    const isSuper = dbUser.system.isMain && dbUser.role?.code === SUPER_ROLE_CODE;

    return {
      id: dbUser.id,
      username: dbUser.username,
      nickname: dbUser.nickname || dbUser.username,
      systemId: dbUser.systemId,
      systemCode: dbUser.system.code,
      systemName: dbUser.system.name,
      isSuper,
      permissions: dbUser.role?.permissions || [],
      roleId: dbUser.roleId,
      roleName: dbUser.role?.name || null,
    };
  }

  /**
   * 修改自己的密码。
   *
   * 注意：
   *   必须先验旧密码，避免 token 被盗后直接改密码锁人。
   *   新密码最短 8 位，这是弱口令的最低底线。
   */
  async changePassword(user: JwtUser, dto: ChangePasswordDto) {
    if (!dto?.oldPassword || !dto?.newPassword) {
      throw new BadRequestException("请输入原密码和新密码");
    }
    if (String(dto.newPassword).length < 8) {
      throw new BadRequestException("新密码至少 8 位");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
    });
    if (!dbUser) throw new UnauthorizedException("用户不存在，请重新登录");

    const matched = await bcrypt.compare(dto.oldPassword, dbUser.passwordHash);
    if (!matched) throw new BadRequestException("原密码不正确");

    await this.prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });

    return { ok: true, message: "密码已修改，请用新密码重新登录" };
  }
}
