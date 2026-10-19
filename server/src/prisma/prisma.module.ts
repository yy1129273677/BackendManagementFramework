import {Global, Module} from '@nestjs/common'
import {PrismaService} from './prisma.service'

/**
 * 数据库模块。
 * 标记为 @Global，其它模块不用重复 imports 就能注入 PrismaService。
 */
@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {
}
