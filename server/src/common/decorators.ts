import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from "./constants";

/**
 * 标记接口不需要登录即可访问（比如登录接口本身、健康检查）。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 声明访问该接口需要的权限码。
 *
 * 用法：@RequirePermissions('table:create')
 * 说明：超级管理员永远能过；普通用户要求「所列权限全部具备」。
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
