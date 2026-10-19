import {ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger} from '@nestjs/common'
import {Response} from 'express'

/**
 * 全局异常过滤器。
 *
 * 干什么：
 *   把抛出的异常统一转成 { code, message, data: null } 的 JSON。
 *   - 业务主动抛的 HttpException（比如「密码错误」）→ 用它的状态码和文案
 *   - 其它没预料到的异常（代码 bug）→ 500，并且把堆栈打到服务器日志，不返回给前端
 *
 * 注意：
 *   前端拿到的 message 是可以直接展示给用户的中文，
 *   所以抛异常时请用中文写好原因，别抛英文技术术语。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exception')

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()

        let status = HttpStatus.INTERNAL_SERVER_ERROR
        let message = '服务器内部错误'

        if (exception instanceof HttpException) {
            status = exception.getStatus()
            const payload = exception.getResponse()

            if (typeof payload === 'string') {
                message = payload
            } else if (payload && typeof payload === 'object') {
                const raw = (payload as any).message
                // class-validator 的错误是数组，拼成一句给人看的话
                message = Array.isArray(raw) ? raw.join('；') : raw || exception.message
            }
        } else if (exception instanceof Error) {
            // 未预料的异常：日志留真相，前端只看到通用提示
            this.logger.error(`${exception.message}\n${exception.stack}`)
        } else {
            this.logger.error(`未知异常：${String(exception)}`)
        }

        response.status(status).json({
            code: status,
            message,
            data: null,
        })
    }
}
