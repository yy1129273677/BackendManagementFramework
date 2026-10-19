import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtUser } from "../common/types";
import { PrismaService } from "../prisma/prisma.service";
import { isUserActive, toJwtUser } from "./jwt-user";

/**
 * JWT 校验策略。
 *
 * 干什么：
 *   从请求头 Authorization: Bearer xxx 里拿出 token，验签并解析出用户身份，
 *   然后**用用户 id 去数据库查一次最新的角色和权限**，把结果放到 request.user，
 *   后面所有守卫和接口都从这里读当前用户。
 *
 * 为什么不直接用 token 里的权限（2026-10-19 改）：
 *   token 里的权限是登录那一刻的快照，管理员改了角色权限后，
 *   用户必须退出重新登录才生效，体验很差。用户明确要求：
 *   **改完权限，刷新页面（F5）就应该看到新菜单**。
 *   所以现在 token 只负责证明「你是谁」，权限每次请求实时查库。
 *
 * 代价与取舍：
 *   - 每个请求多一次「用户 + 角色 + 子系统」的查询（主键查询 + 两个关联，很轻）
 *   - 换来权限变更立即生效、禁用账号立即失效（token 还在也没用）
 *
 * 注意：
 *   验签用的是 server/.env 里的 JWT_SECRET，改了密钥所有已登录用户都会掉线。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") || "bmf-dev-secret",
    });
  }

  /**
   * token 校验通过后，返回值会被挂到 request.user。
   *
   * @param payload token 里解出的旧数据（只用 sub 取用户 id）
   */
  async validate(payload: JwtUser): Promise<JwtUser> {
    // 按 id 查最新用户；角色/子系统一并带出来，省一次查询
    const dbUser = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, system: true },
    });

    // 用户被删 / 被禁用：即使 token 没过期也直接踢下线
    if (!isUserActive(dbUser)) {
      throw new UnauthorizedException("用户不存在或已被禁用，请重新登录");
    }

    return toJwtUser(dbUser);
  }
}
