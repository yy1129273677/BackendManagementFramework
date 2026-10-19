import {Body, Controller, Delete, Get, Param, Patch, Post} from '@nestjs/common'
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger'
import {RequirePermissions} from '../common/decorators'
import {CurrentUser, SystemId} from '../common/param-decorators'
import {JwtUser} from '../common/types'
import {CreateRouteDto, UpdateRouteDto} from './route.dto'
import {RouteService} from './route.service'

/**
 * 路由（菜单）管理接口。
 * 路径：/api/routes
 */
@ApiTags('路由管理')
@ApiBearerAuth()
@Controller('routes')
export class RouteController {
    constructor(private readonly routeService: RouteService) {
    }

    /** 管理页用：当前子系统全部路由 */
    @RequirePermissions('route:read')
    @Get()
    list(@SystemId() systemId: string) {
        return this.routeService.list(systemId)
    }

    /**
     * 前端登录后生成菜单用：只返回「当前用户有权限且未隐藏」的路由。
     * 注意这条不加 route:read 权限要求——普通用户也得能看到自己的菜单。
     */
    @Get('my')
    my(@CurrentUser() user: JwtUser, @SystemId() systemId: string) {
        return this.routeService.myRoutes(user, systemId)
    }

    @RequirePermissions('route:create')
    @Post()
    create(@SystemId() systemId: string, @Body() dto: CreateRouteDto) {
        return this.routeService.create(systemId, dto)
    }

    @RequirePermissions('route:update')
    @Patch(':id')
    update(@SystemId() systemId: string, @Param('id') id: string, @Body() dto: UpdateRouteDto) {
        return this.routeService.update(systemId, id, dto)
    }

    @RequirePermissions('route:delete')
    @Delete(':id')
    remove(@SystemId() systemId: string, @Param('id') id: string) {
        return this.routeService.remove(systemId, id)
    }
}
