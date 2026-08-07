import { Module } from '@nestjs/common';
import { FamilyService } from './family.service';
import { FamilyController } from './family.controller';
import { SupervisionService } from './supervision.service';
import { IoTModule } from '../iot/iot.module';

@Module({
  imports: [IoTModule],
  providers: [FamilyService, SupervisionService],
  controllers: [FamilyController],
  exports: [FamilyService, SupervisionService],
})
export class FamilyModule {}
