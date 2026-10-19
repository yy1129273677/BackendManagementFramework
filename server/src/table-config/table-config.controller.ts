import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
@Controller("table-configs")
export class TableConfigController {
  constructor(private readonly service: TableConfigService) {}

  /** 列表 */
  @RequirePermissions("table:read")
  @Get()
  list(@SystemId() systemId: string, @Query("keyword") keyword?: string) {
    return this.service.list(systemId, keyword);
  }

  /** 详情（设计器打开某张已配置的表时用） */
  @RequirePermissions("table:read")
  @Get(":tcid")
  detail(@SystemId() systemId: string, @Param("tcid") tcid: string) {
    return this.service.getByTcid(systemId, tcid);
  }

  /** 新建：生成 TCID + 建物理表 + 配置入库 */
  @RequirePermissions("table:create")
  @Post()
  create(@SystemId() systemId: string, @CurrentUser() user: JwtUser, @Body() dto: CreateTableConfigDto) {
    return this.service.create(systemId, user, dto);
  }

  /** 修改：可以加字段（会 ADD COLUMN），不能删列或改类型 */
  @RequirePermissions("table:update")
  @Put(":tcid")
  update(@SystemId() systemId: string, @Param("tcid") tcid: string, @Body() dto: UpdateTableConfigDto) {
    return this.service.update(systemId, tcid, dto);
  }

  /** 删除（⚠️ 会 DROP 物理表，数据不可恢复） */
  @RequirePermissions("table:delete")
  @Delete(":tcid")
  remove(@SystemId() systemId: string, @Param("tcid") tcid: string) {
    return this.service.remove(systemId, tcid);
  }
}
