import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../common/constants";

/**
 * 登录守卫：没有合法 token 的请求一律 401。
 *
 * 干什么：
 *   作为全局守卫挂在所有接口上；只有被 @Public() 标记的接口（登录、健康检查）放行。
 *
 * 注意：
 *   这里捕获了 token 过期/格式错误，统一给中文提示，
 *   前端 axios 拦截器看到 401 就会跳回登录页。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 公开接口直接放行，不校验 token
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      // info 里能看到具体原因（过期/签名不对），但只给用户一句好懂的提示
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
    return user;
  }
}
