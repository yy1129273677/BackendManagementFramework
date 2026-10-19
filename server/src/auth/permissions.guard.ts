import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from '@nestjs/common'
import {Reflector} from '@nestjs/core'
import {PERMISSIONS_KEY} from '../common/constants'
import {hasAllPermissions} from '../common/permissions'
import {RequestWithUser} from '../common/types'

/**
 * 权限守卫。
 *
 * 干什么：
 *   读取接口上的 @RequirePermissions('table:create') 元数据，
 *   校验当前用户的权限码列表里是否包含所需权限。
 *
 * 规则：
 *   - 接口没声明权限 → 登录即可访问
 *   - 超管 → 永远放行
 *   - 普通用户 → 必须「全部具备」
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {
    }

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ])
        if (!required || required.length === 0) return true

        const request = context.switchToHttp().getRequest<RequestWithUser>()
        const user = request.user
        if (!user) return true // 未登录的情况由 JwtAuthGuard 处理

        if (!hasAllPermissions(user.permissions, user.isSuper, required)) {
            throw new ForbiddenException(`没有操作权限：${required.join('、')}`)
        }
        return true
    }
}
