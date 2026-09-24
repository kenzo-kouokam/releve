import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';

/**
 * Valide les entrees avec les schemas de @releve/shared : les memes
 * schemas servent aux formulaires Nuxt, les regles ne sont ecrites qu'une fois.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const resultat = this.schema.safeParse(value);

    if (!resultat.success) {
      throw new BadRequestException({
        message: 'Requete invalide',
        erreurs: resultat.error.issues.map((issue) => ({
          champ: issue.path.join('.') || '(racine)',
          message: issue.message,
        })),
      });
    }

    return resultat.data;
  }
}
