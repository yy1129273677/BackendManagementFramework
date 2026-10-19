import {BadRequestException, ConflictException, Injectable, NotFoundException} from '@nestjs/common'
import {PrismaService} from '../prisma/prisma.service'
import {
    CreateDictItemDto,
    CreateDictTypeDto,
    UpdateDictItemDto,
    UpdateDictTypeDto,
} from './dict.dto'

/**
 * 业务字典。
 *
 * 干什么：
 *   存「状态」「类型」这类下拉选项，比如订单状态：待付款/已付款/已发货/已取消。
 *   表格配置里字段的 options 可以直接引用字典编码，前端渲染下拉框时按编码取选项。
 *
 * 为什么要字典而不是写死在前端：
 *   业务方改选项不该找程序员发版。字典放进库，运营在后台点几下就能改。
 */
@Injectable()
export class DictService {
    constructor(private readonly prisma: PrismaService) {
    }

    /** 字典类型列表（带每个类型下的选项数量） */
    async listTypes(systemId: string) {
        const list = await this.prisma.dictType.findMany({
            where: {systemId},
            orderBy: {createdAt: 'asc'},
            include: {_count: {select: {items: true}}},
        })
        return {list}
    }

    /** 新建字典类型 */
    async createType(systemId: string, dto: CreateDictTypeDto) {
        const code = (dto.code || '').trim()
        if (!/^[a-z][a-z0-9_]{1,31}$/.test(code)) {
            throw new BadRequestException('字典编码不合法：小写字母开头，2~32 位小写字母/数字/下划线')
        }
        const exists = await this.prisma.dictType.findFirst({where: {systemId, code}})
        if (exists) throw new ConflictException(`字典编码「${code}」已存在`)

        return this.prisma.dictType.create({
            data: {systemId, code, name: (dto.name || code).trim(), remark: dto.remark || null},
        })
    }

    /** 修改字典类型 */
    async updateType(systemId: string, id: string, dto: UpdateDictTypeDto) {
        const type = await this.prisma.dictType.findFirst({where: {id, systemId}})
        if (!type) throw new NotFoundException('字典类型不存在')

        return this.prisma.dictType.update({
            where: {id},
            data: {name: dto.name?.trim() ?? undefined, remark: dto.remark ?? undefined},
        })
    }

    /** 删除字典类型（选项会级联删除） */
    async removeType(systemId: string, id: string) {
        const type = await this.prisma.dictType.findFirst({where: {id, systemId}})
        if (!type) throw new NotFoundException('字典类型不存在')

        await this.prisma.dictType.delete({where: {id}})
        return {ok: true}
    }

    /** 某个字典类型下的全部选项 */
    async listItems(systemId: string, dictTypeId: string) {
        const type = await this.prisma.dictType.findFirst({where: {id: dictTypeId, systemId}})
        if (!type) throw new NotFoundException('字典类型不存在')

        const list = await this.prisma.dictItem.findMany({
            where: {dictTypeId},
            orderBy: [{sort: 'asc'}, {createdAt: 'asc'}],
        })
        return {list, dictType: type}
    }

    /**
     * 按编码取字典选项。
     * 前端表格组件渲染下拉框时调这个接口，不用先知道 dictTypeId。
     */
    async itemsByCode(systemId: string, code: string) {
        const type = await this.prisma.dictType.findFirst({
            where: {systemId, code},
            include: {items: {where: {status: 1}, orderBy: [{sort: 'asc'}, {createdAt: 'asc'}]}},
        })
        if (!type) return {code, name: code, items: []}
        return {code: type.code, name: type.name, items: type.items.map((item) => ({label: item.label, value: item.value}))}
    }

    /** 新增字典选项 */
    async createItem(systemId: string, dto: CreateDictItemDto) {
        const type = await this.prisma.dictType.findFirst({where: {id: dto.dictTypeId, systemId}})
        if (!type) throw new NotFoundException('字典类型不存在')
        if (!dto.label || !dto.value) throw new BadRequestException('选项文字和值都不能为空')

        const exists = await this.prisma.dictItem.findFirst({
            where: {dictTypeId: dto.dictTypeId, value: dto.value},
        })
        if (exists) throw new ConflictException(`字典值「${dto.value}」已存在`)

        return this.prisma.dictItem.create({
            data: {
                dictTypeId: dto.dictTypeId,
                label: dto.label,
                value: dto.value,
                sort: Number(dto.sort) || 0,
            },
        })
    }

    /** 修改字典选项 */
    async updateItem(systemId: string, id: string, dto: UpdateDictItemDto) {
        const item = await this.prisma.dictItem.findFirst({
            where: {id, dictType: {systemId}},
        })
        if (!item) throw new NotFoundException('字典选项不存在')

        return this.prisma.dictItem.update({
            where: {id},
            data: {
                label: dto.label ?? undefined,
                value: dto.value ?? undefined,
                sort: typeof dto.sort === 'number' ? dto.sort : undefined,
                status: typeof dto.status === 'number' ? dto.status : undefined,
            },
        })
    }

    /** 删除字典选项 */
    async removeItem(systemId: string, id: string) {
        const item = await this.prisma.dictItem.findFirst({where: {id, dictType: {systemId}}})
        if (!item) throw new NotFoundException('字典选项不存在')

        await this.prisma.dictItem.delete({where: {id}})
        return {ok: true}
    }
}
