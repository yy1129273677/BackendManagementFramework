import {BadRequestException, ConflictException, Injectable, NotFoundException} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import {JwtUser} from '../common/types'
import {PrismaService} from '../prisma/prisma.service'
import {CreateUserDto, UpdateUserDto} from './user.dto'

/**
 * 用户管理（按子系统隔离）。
 *
 * 数据隔离：
 *   所有方法第一个参数都是 systemId（来自请求上下文），
 *   查询和写入都带上它，保证 A 子系统管理员看不到 B 子系统的人。
 */
@Injectable()
export class UserService {
    constructor(private readonly prisma: PrismaService) {
    }

    /** 分页查询本系统的用户 */
    async list(systemId: string, page = 1, pageSize = 20, keyword?: string) {
        const currentPage = Math.max(1, Number(page) || 1)
        const size = Math.min(200, Math.max(1, Number(pageSize) || 20))

        const where = {
            systemId,
            ...(keyword
                ? {
                    OR: [
                        {username: {contains: keyword, mode: 'insensitive' as const}},
                        {nickname: {contains: keyword, mode: 'insensitive' as const}},
                    ],
                }
                : {}),
        }

        const [list, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                skip: (currentPage - 1) * size,
                take: size,
                orderBy: {createdAt: 'desc'},
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    status: true,
                    roleId: true,
                    createdAt: true,
                    role: {select: {id: true, code: true, name: true}},
                },
            }),
            this.prisma.user.count({where}),
        ])

        return {list, total, page: currentPage, pageSize: size}
    }

    /** 新建用户 */
    async create(systemId: string, dto: CreateUserDto) {
        const username = (dto.username || '').trim()
        if (!/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(username)) {
            throw new BadRequestException('用户名不合法：字母开头，3~32 位字母/数字/下划线')
        }
        if (!dto.password || String(dto.password).length < 6) {
            throw new BadRequestException('密码至少 6 位')
        }

        const exists = await this.prisma.user.findUnique({
            where: {systemId_username: {systemId, username}},
        })
        if (exists) throw new ConflictException(`用户名「${username}」在本子系统已存在`)

        if (dto.roleId) {
            await this.assertRoleInSystem(systemId, dto.roleId)
        }

        return this.prisma.user.create({
            data: {
                systemId,
                username,
                passwordHash: await bcrypt.hash(String(dto.password), 10),
                nickname: dto.nickname || username,
                roleId: dto.roleId || null,
            },
            select: {id: true, username: true, nickname: true, status: true, roleId: true, createdAt: true},
        })
    }

    /** 修改用户 */
    async update(systemId: string, id: string, dto: UpdateUserDto) {
        const user = await this.prisma.user.findFirst({where: {id, systemId}})
        if (!user) throw new NotFoundException('用户不存在')

        if (dto.roleId) {
            await this.assertRoleInSystem(systemId, dto.roleId)
        }
        if (dto.password && String(dto.password).length < 6) {
            throw new BadRequestException('密码至少 6 位')
        }

        return this.prisma.user.update({
            where: {id},
            data: {
                nickname: dto.nickname ?? undefined,
                status: typeof dto.status === 'number' ? dto.status : undefined,
                roleId: dto.roleId === undefined ? undefined : dto.roleId,
                passwordHash: dto.password ? await bcrypt.hash(String(dto.password), 10) : undefined,
            },
            select: {id: true, username: true, nickname: true, status: true, roleId: true},
        })
    }

    /** 删除用户。不允许删自己，避免把自己锁在外面 */
    async remove(currentUser: JwtUser, systemId: string, id: string) {
        if (currentUser?.sub === id) {
            throw new BadRequestException('不能删除自己')
        }
        const user = await this.prisma.user.findFirst({where: {id, systemId}})
        if (!user) throw new NotFoundException('用户不存在')

        await this.prisma.user.delete({where: {id}})
        return {ok: true}
    }

    /**
     * 校验角色属于同一个子系统。
     * 这是防止「拿 A 系统的角色 id 塞给 B 系统的用户」的越权组合。
     */
    private async assertRoleInSystem(systemId: string, roleId: string): Promise<void> {
        const role = await this.prisma.role.findFirst({where: {id: roleId, systemId}})
        if (!role) throw new BadRequestException('角色不存在或不属于当前子系统')
    }
}
