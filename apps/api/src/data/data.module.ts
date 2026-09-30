import { Module } from "@nestjs/common";
import { DataRepository } from "./data.repository";

@Module({
  providers: [DataRepository],
  exports: [DataRepository],
})
export class DataModule {}
