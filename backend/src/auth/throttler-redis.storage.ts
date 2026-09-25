import { Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Le compte rendu attendu par la garde.
 *
 * Derive du contrat plutot qu'importe : `ThrottlerStorageRecord` existe dans
 * le paquet mais n'est pas reexporte par son index, et le chercher par un
 * chemin interne casserait a la premiere reorganisation. Ici le type suit la
 * signature, donc il suit aussi ses evolutions.
 */
type CompteRendu = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Compteurs de debit partages entre les instances de l'API.
 *
 * Le stockage par defaut de `@nestjs/throttler` est une `Map` dans le
 * processus. Tant qu'une seule instance tourne, c'est exact ; derriere deux
 * replicas, le plafond de cinq connexions par minute en vaut dix, et celui qui
 * cherche un mot de passe en profite exactement autant que la charge le
 * repartit. Le compteur doit donc vivre la ou toutes les instances le voient.
 *
 * **Une panne de Redis ne doit pas fermer l'application.** C'est la meme regle
 * que pour le cache du barometre, et elle se decline ici en un repli sur le
 * stockage memoire : la limitation redevient approximative — par instance —
 * mais elle continue d'exister, et personne ne se retrouve dehors parce qu'un
 * conteneur de cache a redemarre. Refuser toutes les requetes serait plus
 * « sur » sur le papier et reviendrait a offrir un deni de service a qui sait
 * atteindre Redis.
 */
export class ThrottlerRedisStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ThrottlerRedisStorage.name);
  private readonly client: Redis | null;

  /** Repli local, aussi utilise quand Redis n'est pas configure du tout. */
  private readonly memoire = new ThrottlerStorageService();

  /** Un seul message d'alerte : sinon chaque requete en produirait un. */
  private panneSignalee = false;

  /**
   * Espace de noms des cles, derive du nom de la base.
   *
   * Meme raison que pour le cache : le poste de developpement et la suite de
   * tests partagent un Redis. Sans prefixe, les appels des tests useraient le
   * quota de l'application, et la limitation paraitrait se declencher au
   * hasard.
   */
  private readonly prefixe: string;

  /**
   * Increment atomique.
   *
   * Tout se joue cote serveur en un aller-retour, parce que la sequence
   * « lire, decider, ecrire » depuis Node laisserait passer deux requetes
   * simultanees au-dessus du plafond — ce qui est precisement le cas qu'un
   * attaquant produit.
   *
   * KEYS[1] compte les passages, KEYS[2] marque le blocage. La duree de vie du
   * compteur n'est posee qu'a la premiere frappe : la reposer a chaque coup
   * ferait glisser la fenetre indefiniment et un flux continu ne serait jamais
   * remis a zero.
   */
  private static readonly SCRIPT = `
    local blocage = redis.call('PTTL', KEYS[2])
    if blocage > 0 then
      local courant = tonumber(redis.call('GET', KEYS[1]) or '0')
      return { courant, redis.call('PTTL', KEYS[1]), 1, blocage }
    end

    local passages = redis.call('INCR', KEYS[1])
    if passages == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end

    local duree = redis.call('PTTL', KEYS[1])
    if duree < 0 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
      duree = tonumber(ARGV[1])
    end

    if passages > tonumber(ARGV[2]) then
      redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
      return { passages, duree, 1, tonumber(ARGV[3]) }
    end

    return { passages, duree, 0, 0 }
  `;

  constructor(urlRedis: string | undefined, urlBase: string | undefined) {
    this.prefixe = ThrottlerRedisStorage.espaceDeNoms(urlBase);

    if (!urlRedis) {
      this.logger.warn('REDIS_URL absent : les compteurs de debit restent locaux a l instance');
      this.client = null;

      return;
    }

    this.client = new Redis(urlRedis, {
      // Sans plafond, ioredis reessaie indefiniment et chaque requete attend
      // derriere lui — le garde-fou deviendrait la panne.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      retryStrategy: (tentatives) => Math.min(tentatives * 500, 5_000),
    });

    this.client.on('error', (erreur: Error) => {
      if (!this.panneSignalee) {
        this.panneSignalee = true;
        this.logger.warn(`Redis injoignable, limitation locale a l instance : ${erreur.message}`);
      }
    });
  }

  /** Nom de la base, ou « defaut » si l'URL est absente ou illisible. */
  private static espaceDeNoms(urlBase: string | undefined): string {
    if (!urlBase) {
      return 'defaut';
    }

    try {
      return new URL(urlBase).pathname.replace(/^\//, '') || 'defaut';
    } catch {
      return 'defaut';
    }
  }

  async increment(
    cle: string,
    ttl: number,
    limite: number,
    dureeBlocage: number,
    nomLimiteur: string,
  ): Promise<CompteRendu> {
    if (!this.client) {
      return this.memoire.increment(cle, ttl, limite, dureeBlocage, nomLimiteur);
    }

    const racine = `${this.prefixe}:debit:${nomLimiteur}:${cle}`;

    try {
      const [passages, dureeMs, bloque, blocageMs] = (await this.client.eval(
        ThrottlerRedisStorage.SCRIPT,
        2,
        racine,
        `${racine}:blocage`,
        String(ttl),
        String(limite),
        String(dureeBlocage),
      )) as [number, number, number, number];

      return {
        totalHits: passages,
        // Le contrat de `@nestjs/throttler` attend des secondes ici, alors que
        // les durees entrantes sont en millisecondes. On arrondit au-dessus,
        // comme le fait le stockage memoire : annoncer « reessayez dans 0 s »
        // enverrait le client reessayer immediatement, pour rien.
        timeToExpire: Math.ceil(Math.max(dureeMs, 0) / 1000),
        isBlocked: bloque === 1,
        timeToBlockExpire: Math.ceil(Math.max(blocageMs, 0) / 1000),
      };
    } catch (cause) {
      if (!this.panneSignalee) {
        this.panneSignalee = true;
        this.logger.warn(`Compteur de debit indisponible, repli local : ${String(cause)}`);
      }

      return this.memoire.increment(cle, ttl, limite, dureeBlocage, nomLimiteur);
    }
  }

  /**
   * Ferme la connexion. Appelee par le module, pas par Nest : cette classe est
   * instanciee dans une fabrique et non declaree comme fournisseur, donc les
   * crochets de cycle de vie ne l'atteignent pas.
   */
  async fermer(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
