import { Module } from "@nestjs/common";
import { VectorController } from "./vector.controller";

@Module({
  controllers: [VectorController],
})
export class VectorModule {}
