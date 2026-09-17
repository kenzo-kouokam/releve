import { ConflictException, Injectable } from '@nestjs/common';
import type { QualificationCreate, QualificationResume } from '@releve/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QualificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<QualificationResume[]> {
    return this.prisma.qualification.findMany({
      select: { id: true, code: true, libelle: true },
      orderBy: { code: 'asc' },
    });
  }

  async creer(donnees: QualificationCreate): Promise<QualificationResume> {
    const existante = await this.prisma.qualification.findUnique({
      where: { code: donnees.code },
    });

    if (existante) {
      throw new ConflictException(`La qualification ${donnees.code} existe deja`);
    }

    return this.prisma.qualification.create({
      data: donnees,
      select: { id: true, code: true, libelle: true },
    });
  }
}
