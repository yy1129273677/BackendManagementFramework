import {Module} from '@nestjs/common'
import {ConfigModule} from '@nestjs/config'
import {APP_GUARD} from '@nestjs/core'
import {AuthModule} from './auth/auth.module'
import {JwtAuthGuard} from './auth/jwt-auth.guard'
import {PermissionsGuard} from './auth/permissions.guard'
import {SystemContextGuard} from './auth/system-context.guard'
import {DictModule} from './dict/dict.module'
import {HealthModule} from './health/health.module'
import {PrismaModule} from './prisma/prisma.module'
import {RoleModule} from './role/role.module'
import {RouteModule} from './route/route.module'
import {SystemModule} from './system/system.module'
import {TableConfigModule} from './table-config/table-config.module'
import {TableDataModule} from './table-data/table-data.module'
import {UserModule} from './user/user.module'
import {VectorModule} from './vector/vector.module'

/**
 * 应用根模块。
 *
 * 守卫注册顺序很关键（Nest 按注册顺序执行）：
 *   1. JwtAuthGuard        —— 先确认「你是谁」，解析出 request.user
 *   2. SystemContextGuard  —— 再确认「这次操作哪个子系统」，解析出 request.systemId
 *   3. PermissionsGuard    —— 最后确认「你有没有权限做这件事」
 * 顺序反了就会出现「拿不到 user 就去判权限」的问题。
 */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env'],
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
        HealthModule,
    ],
    providers: [
        {provide: APP_GUARD, useClass: JwtAuthGuard},
        {provide: APP_GUARD, useClass: SystemContextGuard},
        {provide: APP_GUARD, useClass: PermissionsGuard},
    ],
})
export class AppModule {
}
