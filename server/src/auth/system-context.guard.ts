import {BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable} from '@nestjs/common'
import {PrismaService} from '../prisma/prisma.service'
import {RequestWithUser} from '../common/types'

/**
 * 子系统上下文守卫。
 *
 * 干什么：
 *   决定「这次请求操作的是哪个子系统」。
 *   - 普通用户：永远是自己所属的系统，改不了
 *   - 超管：默认是主系统，但可以在请求头里带 X-System-Code: demo，
 *     把操作目标切到 demo 子系统，去给那个子系统配路由/表格/用户
 *
 * 结果写在哪：
 *   request.systemId / request.systemCode
 *   业务代码用 @SystemId() 拿，所有查询都带这个值做数据隔离。
 *
 * 注意：
 *   切换子系统只允许超管；普通用户带了也会被拒绝（防止横向越权）。
 */
@Injectable()
export class SystemContextGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithUser>()
        const user = request.user

        // 未登录的公开接口没有用户，跳过
        if (!user) return true

        // 默认上下文 = 用户自己所属的系统
        request.systemId = user.systemId
        request.systemCode = user.systemCode

        const headerValue = request.headers['x-system-code']
        const targetCode = Array.isArray(headerValue) ? headerValue[0] : headerValue

        // 没带请求头，或者指的就是自己的系统，不需要切换
        if (!targetCode || String(targetCode) === user.systemCode) return true

        if (!user.isSuper) {
            throw new ForbiddenException('只有超级管理员可以切换到其它子系统')
        }

        const system = await this.prisma.system.findUnique({
            where: {code: String(targetCode)},
            select: {id: true, code: true, status: true},
        })
        if (!system) {
            throw new BadRequestException(`子系统「${targetCode}」不存在`)
        }
        if (system.status !== 1) {
            throw new ForbiddenException(`子系统「${targetCode}」已停用`)
        }

        request.systemId = system.id
        request.systemCode = system.code
        return true
    }
}
