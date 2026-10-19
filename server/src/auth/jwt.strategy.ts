import {Injectable} from '@nestjs/common'
import {ConfigService} from '@nestjs/config'
import {PassportStrategy} from '@nestjs/passport'
import {ExtractJwt, Strategy} from 'passport-jwt'
import {JwtUser} from '../common/types'

/**
 * JWT 校验策略。
 *
 * 干什么：
 *   从请求头 Authorization: Bearer xxx 里拿出 token，验签并解析出用户信息，
 *   放到 request.user 上，后面所有守卫和接口都从这里读当前用户。
 *
 * 注意：
 *   验签用的是 server/.env 里的 JWT_SECRET，改了密钥所有已登录用户都会掉线。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private readonly configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'bmf-dev-secret',
        })
    }

    /**
     * token 校验通过后，返回值会被挂到 request.user。
     * 这里直接返回 token 里的内容，不再查库——
     * 代价是权限是登录时的快照，改了权限需要重新登录（见 docs/design/06-failure.md）。
     */
    async validate(payload: JwtUser): Promise<JwtUser> {
        return payload
    }
}
