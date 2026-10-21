import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../common/decorators";
import { CurrentUser, SystemId } from "../common/param-decorators";
import { JwtUser } from "../common/types";
import { CreateTableConfigDto, UpdateTableConfigDto } from "./table-config.dto";
import { TableConfigService } from "./table-config.service";

/**
 * 表格配置管理接口（超管在后台配表格时用）。
 * 路径：/api/table-configs
 *
 * 注意：真正给业务页面用的接口在 table-data 模块（/api/table/:tcid/*）。
 */
@ApiTags("表格配置（TCID）")
@ApiBearerAuth()
@ApiHeader({
  name: "X-System-Code",
  required: false,
  description: "超管切换到目标子系统的系统编码；普通用户只能操作自己所属子系统",
  example: "demo",
})
@Controller("table-configs")
export class TableConfigController {
  constructor(private readonly service: TableConfigService) {}

  /** 列表 */
  @RequirePermissions("table:read")
  @ApiOperation({
    summary: "表格配置列表",
    description: "只返回当前子系统的表格配置，按创建时间倒序，并附带字段数量 fieldCount。",
  })
  @ApiQuery({ name: "keyword", required: false, description: "按表格名称或 TCID 模糊筛选", example: "订单" })
  @Get()
  list(@SystemId() systemId: string, @Query("keyword") keyword?: string) {
    return this.service.list(systemId, keyword);
  }

  /** 详情（设计器打开某张已配置的表时用） */
  @RequirePermissions("table:read")
  @ApiOperation({
    summary: "表格配置详情",
    description: "按 TCID 读取配置，带子系统隔离；不存在或不属于当前子系统返回 404。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，例如 TDEMOORDERS", example: "TDEMOORDERS" })
  @Get(":tcid")
  detail(@SystemId() systemId: string, @Param("tcid") tcid: string) {
    return this.service.getByTcid(systemId, tcid);
  }

  /** 新建：生成 TCID + 建物理表 + 配置入库 */
  @RequirePermissions("table:create")
  @ApiOperation({
    summary: "新建表格配置",
    description:
      "校验字段后生成 TCID，创建物理表 biz_<tcid 小写>，再写入配置。字段非法直接返回 400 且不产生副作用；单张表最多 60 个字段。",
  })
  @Post()
  create(@SystemId() systemId: string, @CurrentUser() user: JwtUser, @Body() dto: CreateTableConfigDto) {
    return this.service.create(systemId, user, dto);
  }

  /** 修改：可以加字段（会 ADD COLUMN），不能删列或改类型 */
  @RequirePermissions("table:update")
  @ApiOperation({
    summary: "修改表格配置",
    description:
      "可以新增字段（自动 ADD COLUMN）；从配置移除字段时物理列保留、数据不删除；不允许修改已有字段的列类型，会直接返回 400。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，例如 TDEMOORDERS", example: "TDEMOORDERS" })
  @Put(":tcid")
  update(@SystemId() systemId: string, @Param("tcid") tcid: string, @Body() dto: UpdateTableConfigDto) {
    return this.service.update(systemId, tcid, dto);
  }

  /** 删除（⚠️ 会 DROP 物理表，数据不可恢复） */
  @RequirePermissions("table:delete")
  @ApiOperation({
    summary: "删除表格配置（不可恢复）",
    description: "会 DROP 物理表 biz_<tcid 小写>，表内业务数据一并删除，不可恢复。",
  })
  @ApiParam({ name: "tcid", description: "表格配置编号，例如 TDEMOORDERS", example: "TDEMOORDERS" })
  @Delete(":tcid")
  remove(@SystemId() systemId: string, @Param("tcid") tcid: string) {
    return this.service.remove(systemId, tcid);
  }
}
