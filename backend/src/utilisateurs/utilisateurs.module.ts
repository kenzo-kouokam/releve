import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UtilisateursController } from './utilisateurs.controller';
import { UtilisateursService } from './utilisateurs.service';

@Module({
  // AuthModule pour SessionsService : desactiver un compte doit couper ses sessions.
  imports: [AuthModule],
  controllers: [UtilisateursController],
  providers: [UtilisateursService],
  exports: [UtilisateursService],
})
export class UtilisateursModule {}
