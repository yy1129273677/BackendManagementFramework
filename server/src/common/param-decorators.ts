import {createParamDecorator, ExecutionContext} from '@nestjs/common'
import {RequestWithUser} from './types'

/**
 * 取当前登录用户：@CurrentUser() user: JwtUser
 */
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>()
    return request.user
})

/**
 * 取「本次请求实际操作的子系统 id」。
 *
 * 为什么要单独取：
 *   超管登录在主系统，但可以用请求头 X-System-Code 切换到某个子系统去配置内容，
 *   这时 systemId 不等于 user.systemId。所有业务查询都应该用这个值做数据隔离。
 */
export const SystemId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>()
    return request.systemId
})
