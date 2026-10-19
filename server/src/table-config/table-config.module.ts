import { Module } from "@nestjs/common";
import { DdlService } from "./ddl.service";
import { TableConfigController } from "./table-config.controller";
import { TableConfigService } from "./table-config.service";

@Module({
  controllers: [TableConfigController],
  providers: [TableConfigService, DdlService],
  exports: [TableConfigService, DdlService],
})
export class TableConfigModule {}
