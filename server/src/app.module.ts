import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { SystemContextGuard } from "./auth/system-context.guard";
import { DictModule } from "./dict/dict.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RoleModule } from "./role/role.module";
import { RouteModule } from "./route/route.module";
import { SystemModule } from "./system/system.module";
import { StatsModule } from "./stats/stats.module";
import { TableConfigModule } from "./table-config/table-config.module";
import { TableDataModule } from "./table-data/table-data.module";
import { UserModule } from "./user/user.module";
import { VectorModule } from "./vector/vector.module";

/**
 * 应用根模块。
 *
 * 守卫注册顺序很关键（Nest 按注册顺序执行）：
 *   0. ThrottlerGuard      —— 最先挡限流，避免无效请求（含伪造 token）耗尽后续资源
 *   1. JwtAuthGuard        —— 先确认「你是谁」，解析出 request.user
 *   2. SystemContextGuard  —— 再确认「这次操作哪个子系统」，解析出 request.systemId
 *   3. PermissionsGuard    —— 最后确认「你有没有权限做这件事」
 * 顺序反了就会出现「拿不到 user 就去判权限」的问题。
 *
 * 限流阈值：
 *   全局 120 次/分钟/ IP —— 后台页面一次加载大约 5~10 个请求，120 够用又不至于被刷爆；
 *   登录接口在 auth.controller 里单独压到 5 次/分钟（防暴力破解密码）。
 *   为什么不是全局 10 次：那样正常刷新几次页面就会把自己锁住。
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env"],
    }),
    // 全局限流。存储用的是默认内存实现，单容器部署够用；
    // 以后要多副本部署，需要换成 Redis storage，否则每个副本各算各的。
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
      errorMessage: "请求太频繁，请稍后再试",
    }),
    PrismaModule,
    AuthModule,
    SystemModule,
    UserModule,
    RoleModule,
    DictModule,
    RouteModule,
    TableConfigModule,
    TableDataModule,
    VectorModule,
    StatsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SystemContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
