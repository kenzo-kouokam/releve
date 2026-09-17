import { Module } from '@nestjs/common';
import { QualificationsController } from './qualifications.controller';
import { QualificationsService } from './qualifications.service';

@Module({
  controllers: [QualificationsController],
  providers: [QualificationsService],
  exports: [QualificationsService],
})
export class QualificationsModule {}
