import {Body, Controller, Get, Post} from '@nestjs/common'
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger'
import {Public} from '../common/decorators'
import {CurrentUser} from '../common/param-decorators'
import {JwtUser} from '../common/types'
import {ChangePasswordDto, LoginDto} from './auth.dto'
import {AuthService} from './auth.service'

/**
 * 认证接口。
 * 路径前缀统一是 /api（在 main.ts 里设置的全局前缀）。
 */
@ApiTags('认证')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {
    }

    /**
     * 登录：POST /api/auth/login
     * 不需要 token（@Public），否则就成了「要先登录才能登录」的死循环。
     */
    @Public()
    @Post('login')
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto)
    }

    /**
     * 当前用户信息：GET /api/auth/profile
     * 前端刷新页面后用它恢复登录态。
     */
    @ApiBearerAuth()
    @Get('profile')
    profile(@CurrentUser() user: JwtUser) {
        return this.authService.profile(user)
    }

    /**
     * 修改自己的密码：POST /api/auth/password
     */
    @ApiBearerAuth()
    @Post('password')
    changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(user, dto)
    }
}
