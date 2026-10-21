import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { SystemId } from "../common/param-decorators";
import { CreateDictItemDto, CreateDictTypeDto, UpdateDictItemDto, UpdateDictTypeDto } from "./dict.dto";
import { DictService } from "./dict.service";

/**
 * 业务字典接口。
 * 路径：/api/dict/*
 */
@ApiTags("业务字典")
@ApiBearerAuth()
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能操作自己所属子系统",
  example: "demo",
})
@Controller("dict")
export class DictController {
  constructor(private readonly dictService: DictService) {}

  /** 字典类型列表 */
  @RequirePermissions("dict:read")
  @ApiOperation({ summary: "字典类型列表", description: "只返回当前子系统的字典类型，并附带每个类型下的选项数量。" })
  @Get("types")
  listTypes(@SystemId() systemId: string) {
    return this.dictService.listTypes(systemId);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({
    summary: "新建字典类型",
    description: "编码小写字母开头、2~32 位小写字母/数字/下划线，子系统内唯一；编码创建后不可修改。",
  })
  @Post("types")
  createType(@SystemId() systemId: string, @Body() dto: CreateDictTypeDto) {
    return this.dictService.createType(systemId, dto);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({ summary: "修改字典类型", description: "只更新传入的名称、备注；编码不可修改。" })
  @ApiParam({
    name: "id",
    description: "字典类型 id，必须属于当前子系统",
    example: "5c8e2a1b-3d4f-4e6a-9b7c-2d1e0f3a4b5c",
  })
  @Patch("types/:id")
  updateType(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateDictTypeDto) {
    return this.dictService.updateType(systemId, id, dto);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({ summary: "删除字典类型", description: "会级联删除该类型下的所有字典选项，不可恢复。" })
  @ApiParam({
    name: "id",
    description: "字典类型 id，必须属于当前子系统",
    example: "5c8e2a1b-3d4f-4e6a-9b7c-2d1e0f3a4b5c",
  })
  @Delete("types/:id")
  removeType(@SystemId() systemId: string, @Param("id") id: string) {
    return this.dictService.removeType(systemId, id);
  }

  /** 某个类型下的选项 */
  @RequirePermissions("dict:read")
  @ApiOperation({
    summary: "字典选项列表",
    description: "返回指定字典类型下的全部选项（含停用项）和该类型本身的信息。",
  })
  @ApiParam({
    name: "id",
    description: "字典类型 id，必须属于当前子系统",
    example: "5c8e2a1b-3d4f-4e6a-9b7c-2d1e0f3a4b5c",
  })
  @Get("types/:id/items")
  listItems(@SystemId() systemId: string, @Param("id") id: string) {
    return this.dictService.listItems(systemId, id);
  }

  /** 按编码取选项（表格组件渲染下拉框用，登录即可访问） */
  @ApiOperation({
    summary: "按编码取字典选项",
    description: "登录即可访问，不要求 dict:read；只返回启用（status=1）的选项，编码不存在时返回空列表而不报错。",
  })
  @ApiParam({ name: "code", description: "字典编码，例如 order_status", example: "order_status" })
  @Get("by-code/:code")
  itemsByCode(@SystemId() systemId: string, @Param("code") code: string) {
    return this.dictService.itemsByCode(systemId, code);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({
    summary: "新增字典选项",
    description: "dictTypeId 必须是当前子系统下的字典类型；同一字典类型下 value 唯一，label 和 value 都不能为空。",
  })
  @Post("items")
  createItem(@SystemId() systemId: string, @Body() dto: CreateDictItemDto) {
    return this.dictService.createItem(systemId, dto);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({ summary: "修改字典选项", description: "只更新传入的字段；选项必须属于当前子系统的字典类型。" })
  @ApiParam({
    name: "id",
    description: "字典选项 id，必须属于当前子系统",
    example: "7b9c1d3e-5f7a-4b9c-8d0e-2f4a6b8c0d1e",
  })
  @Patch("items/:id")
  updateItem(@SystemId() systemId: string, @Param("id") id: string, @Body() dto: UpdateDictItemDto) {
    return this.dictService.updateItem(systemId, id, dto);
  }

  @RequirePermissions("dict:manage")
  @ApiOperation({ summary: "删除字典选项", description: "删除后不可恢复；选项必须属于当前子系统的字典类型。" })
  @ApiParam({
    name: "id",
    description: "字典选项 id，必须属于当前子系统",
    example: "7b9c1d3e-5f7a-4b9c-8d0e-2f4a6b8c0d1e",
  })
  @Delete("items/:id")
  removeItem(@SystemId() systemId: string, @Param("id") id: string) {
    return this.dictService.removeItem(systemId, id);
  }
}
