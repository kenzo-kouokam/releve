import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache Redis du barometre.
 *
 * Le calcul agrege quelques milliers de lignes avec une mediane : c'est rapide,
 * mais il est rejoue a chaque affichage de formulaire de mission, et la donnee
 * sous-jacente ne bouge qu'une fois par jour, apres l'import.
 *
 * Regle de conception : une panne de Redis ne doit jamais faire tomber une
 * page. Toute erreur est avalee et le calcul repart vers PostgreSQL — le cache
 * est une commodite, pas une dependance.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis | null;

  /** Un seul message d'alerte : sinon chaque requete en produirait un. */
  private panneSignalee = false;

  /**
   * Espace de noms des cles, derive du nom de la base.
   *
   * Sans lui, la suite de tests et le poste de developpement partagent le meme
   * Redis : les bases sont bien separees, mais un barometre calcule pendant les
   * tests ressort ensuite dans l'application. Le bug est silencieux et la
   * donnee affichee parait simplement fausse.
   */
  private readonly prefixe: string;

  constructor(config: ConfigService) {
    this.prefixe = CacheService.espaceDeNoms(config.get<string>('DATABASE_URL'));

    const url = config.get<string>('REDIS_URL');

    if (!url) {
      this.logger.warn('REDIS_URL absent : le barometre sera recalcule a chaque appel');
      this.client = null;
      return;
    }

    this.client = new Redis(url, {
      // Sans plafond, ioredis reessaie indefiniment et chaque appel attend.
      maxRetriesPerRequest: 1,
      // La file d'attente est gardee : les toutes premieres commandes partent
      // avant que la connexion soit etablie, et sans elle elles echouent alors
      // que Redis repond parfaitement une milliseconde plus tard.
      enableOfflineQueue: true,
      retryStrategy: (tentatives) => Math.min(tentatives * 500, 5_000),
    });

    this.client.on('error', (erreur) => {
      if (!this.panneSignalee) {
        this.panneSignalee = true;
        this.logger.warn(`Redis injoignable, calcul direct : ${erreur.message}`);
      }
    });
  }

  /** Nom de la base, ou « defaut » si l'URL est absente ou illisible. */
  private static espaceDeNoms(urlBase: string | undefined): string {
    if (!urlBase) {
      return 'defaut';
    }

    try {
      const chemin = new URL(urlBase).pathname.replace(/^\//, '');

      return chemin || 'defaut';
    } catch {
      return 'defaut';
    }
  }

  private cle(nom: string): string {
    return `${this.prefixe}:${nom}`;
  }

  async lire<T>(cle: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      const brut = await this.client.get(this.cle(cle));

      return brut ? (JSON.parse(brut) as T) : null;
    } catch {
      return null;
    }
  }

  async ecrire(cle: string, valeur: unknown, dureeSecondes: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.set(this.cle(cle), JSON.stringify(valeur), 'EX', dureeSecondes);
    } catch {
      // Un cache qui n'ecrit pas n'est pas une erreur fonctionnelle.
    }
  }

  /** Invalide une famille de cles apres un import. */
  async oublier(motif: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const cles = await this.client.keys(this.cle(motif));

      if (cles.length) {
        await this.client.del(...cles);
        this.logger.log(`${cles.length} entrees de cache invalidees`);
      }
    } catch {
      // Idem : au pire le cache expire tout seul.
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
