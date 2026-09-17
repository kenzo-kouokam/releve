import { Module } from '@nestjs/common';
import { GeocodageModule } from '../geocodage/geocodage.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [GeocodageModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
