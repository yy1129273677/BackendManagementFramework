import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * 统一响应包装器。
 *
 * 干什么：
 *   把所有接口的返回值统一包成 { code: 0, message: 'ok', data: ... }。
 *   这样前端 axios 拦截器只需要处理一种格式，不用每个接口判断一次。
 *
 * 注意：
 *   - code 为 0 表示成功；失败由异常过滤器返回非 0（HTTP 状态码）
 *   - 如果某个 controller 已经手动返回了 { __wrapped: true, ... } 就原样放行
 *     （给需要流式返回 / 文件下载的接口留后门）
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((data: any) => {
        // 已经被包装过就不再重复包一层
        if (data && typeof data === "object" && data.__wrapped === true) {
          const { __wrapped, ...rest } = data;
          return rest;
        }

        return {
          code: 0,
          message: "ok",
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}
