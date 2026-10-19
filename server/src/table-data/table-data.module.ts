import { Module } from "@nestjs/common";
import { TableConfigModule } from "../table-config/table-config.module";
import { TableDataController } from "./table-data.controller";
import { TableDataService } from "./table-data.service";

@Module({
  imports: [TableConfigModule],
  controllers: [TableDataController],
  providers: [TableDataService],
  exports: [TableDataService],
})
export class TableDataModule {}
