import {Body, Controller, Delete, Get, Param, Patch, Post} from '@nestjs/common'
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger'
import {RequirePermissions} from '../common/decorators'
import {SystemId} from '../common/param-decorators'
import {
    CreateDictItemDto,
    CreateDictTypeDto,
    UpdateDictItemDto,
    UpdateDictTypeDto,
} from './dict.dto'
import {DictService} from './dict.service'

/**
 * 业务字典接口。
 * 路径：/api/dict/*
 */
@ApiTags('业务字典')
@ApiBearerAuth()
@Controller('dict')
export class DictController {
    constructor(private readonly dictService: DictService) {
    }

    /** 字典类型列表 */
    @RequirePermissions('dict:read')
    @Get('types')
    listTypes(@SystemId() systemId: string) {
        return this.dictService.listTypes(systemId)
    }

    @RequirePermissions('dict:manage')
    @Post('types')
    createType(@SystemId() systemId: string, @Body() dto: CreateDictTypeDto) {
        return this.dictService.createType(systemId, dto)
    }

    @RequirePermissions('dict:manage')
    @Patch('types/:id')
    updateType(@SystemId() systemId: string, @Param('id') id: string, @Body() dto: UpdateDictTypeDto) {
        return this.dictService.updateType(systemId, id, dto)
    }

    @RequirePermissions('dict:manage')
    @Delete('types/:id')
    removeType(@SystemId() systemId: string, @Param('id') id: string) {
        return this.dictService.removeType(systemId, id)
    }

    /** 某个类型下的选项 */
    @RequirePermissions('dict:read')
    @Get('types/:id/items')
    listItems(@SystemId() systemId: string, @Param('id') id: string) {
        return this.dictService.listItems(systemId, id)
    }

    /** 按编码取选项（表格组件渲染下拉框用，登录即可访问） */
    @Get('by-code/:code')
    itemsByCode(@SystemId() systemId: string, @Param('code') code: string) {
        return this.dictService.itemsByCode(systemId, code)
    }

    @RequirePermissions('dict:manage')
    @Post('items')
    createItem(@SystemId() systemId: string, @Body() dto: CreateDictItemDto) {
        return this.dictService.createItem(systemId, dto)
    }

    @RequirePermissions('dict:manage')
    @Patch('items/:id')
    updateItem(@SystemId() systemId: string, @Param('id') id: string, @Body() dto: UpdateDictItemDto) {
        return this.dictService.updateItem(systemId, id, dto)
    }

    @RequirePermissions('dict:manage')
    @Delete('items/:id')
    removeItem(@SystemId() systemId: string, @Param('id') id: string) {
        return this.dictService.removeItem(systemId, id)
    }
}
