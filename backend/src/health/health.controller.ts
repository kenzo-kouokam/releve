import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorateurs';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('sante')
@Controller('sante')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Etat de l'API et de la base de donnees" })
  async verifier(): Promise<{ api: string; base: string; horodatage: string }> {
    let base = 'ko';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      base = 'ok';
    } catch {
      base = 'ko';
    }

    return { api: 'ok', base, horodatage: new Date().toISOString() };
  }
}
