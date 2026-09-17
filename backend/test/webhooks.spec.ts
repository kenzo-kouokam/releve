import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';
import type { EvenementSortant } from '@releve/shared';
import { WebhooksService } from '../src/evenements/webhooks.service';

const SECRET = 'secret-de-test-pour-la-signature';

interface Recu {
  entetes: Record<string, string | undefined>;
  brut: string;
}

/**
 * Le format de l'émission, éprouvé contre un vrai serveur.
 *
 * C'est le point d'intégration le plus fragile du contrat : si la signature ne
 * porte pas exactement sur les octets transmis, le workflow n8n les rejette
 * tous — silencieusement, puisqu'un rejet de signature ressemble à une absence
 * d'événement. Un test qui recalculerait la signature avec le code de
 * l'émetteur ne prouverait rien ; celui-ci la vérifie comme le fait le
 * consommateur, à partir du corps reçu sur le réseau.
 */
describe('emission des evenements', () => {
  let serveur: Server | undefined;

  afterEach(() => {
    serveur?.close();
    serveur = undefined;
  });

  /** Un consommateur qui enregistre ce qu'il reçoit, octets compris. */
  async function ecouter(): Promise<{ url: string; recus: Recu[] }> {
    const recus: Recu[] = [];

    serveur = createServer((requete, reponse) => {
      let brut = '';

      requete.on('data', (morceau) => {
        brut += morceau;
      });

      requete.on('end', () => {
        recus.push({ entetes: requete.headers as Record<string, string | undefined>, brut });
        reponse.writeHead(200).end('ok');
      });
    });

    await new Promise<void>((pret) => serveur!.listen(0, '127.0.0.1', pret));

    const { port } = serveur!.address() as AddressInfo;

    return { url: `http://127.0.0.1:${port}/webhook/releve/evenements`, recus };
  }

  function service(valeurs: Record<string, string>): WebhooksService {
    return new WebhooksService({
      get: (cle: string) => valeurs[cle],
    } as unknown as ConfigService);
  }

  function evenement(deliveryId: string): EvenementSortant {
    return {
      event: 'mission.publiee',
      occurredAt: '2026-09-22T08:02:12.000Z',
      deliveryId,
      mission: {
        id: '11111111-1111-4111-8111-111111111111',
        reference: 'MIS-2026-0042',
        qualification: 'AES',
        commune: 'Nantes',
        departement: '44',
        dateDebut: '2026-09-23',
        dateFin: '2026-09-23',
        heureDebut: '07:00',
        heureFin: '09:00',
        tauxHoraire: 13.5,
        lienApp: 'http://localhost:3000/missions/11111111-1111-4111-8111-111111111111',
      },
      propositions: [],
    };
  }

  /** Attend que le serveur ait reçu, sans figer la suite si rien ne vient. */
  async function attendreUn(recus: Recu[]): Promise<Recu> {
    for (let essai = 0; essai < 100; essai += 1) {
      if (recus.length) {
        return recus[0]!;
      }

      await new Promise((suite) => setTimeout(suite, 20));
    }

    throw new Error('Aucun evenement recu');
  }

  it('signe exactement les octets transmis', async () => {
    const { url, recus } = await ecouter();

    service({ N8N_EVENTS_WEBHOOK_URL: url, N8N_WEBHOOK_SECRET: SECRET }).emettre(
      'mission.publiee',
      evenement('livraison-1'),
    );

    const recu = await attendreUn(recus);

    // Vérifié comme le fait le consommateur : à partir du corps brut reçu, et
    // non de l'objet qu'on croit avoir envoyé.
    const attendue = createHmac('sha256', SECRET).update(recu.brut).digest('hex');

    expect(recu.entetes['x-releve-signature']).toBe(`sha256=${attendue}`);
  });

  it('porte l evenement et l identifiant de livraison en entete', async () => {
    const { url, recus } = await ecouter();

    service({ N8N_EVENTS_WEBHOOK_URL: url, N8N_WEBHOOK_SECRET: SECRET }).emettre(
      'mission.publiee',
      evenement('livraison-2'),
    );

    const recu = await attendreUn(recus);

    expect(recu.entetes['x-releve-event']).toBe('mission.publiee');
    expect(recu.entetes['x-releve-delivery']).toBe('livraison-2');
    expect(recu.entetes['content-type']).toBe('application/json');
    expect(JSON.parse(recu.brut).mission.reference).toBe('MIS-2026-0042');
  });

  it('se tait, sans echouer, quand rien n est configure', async () => {
    const muet = service({});

    expect(muet.enSourdine).toBe(true);
    expect(() => muet.emettre('mission.publiee', evenement('livraison-3'))).not.toThrow();
    expect(muet.derniersEmis()).toHaveLength(1);
  });

  it('ne fait pas echouer l appelant quand le consommateur est injoignable', async () => {
    // Port ferme : l'emission echoue a chaque tentative. Rien ne doit remonter.
    const service1 = service({
      N8N_EVENTS_WEBHOOK_URL: 'http://127.0.0.1:1/injoignable',
      N8N_WEBHOOK_SECRET: SECRET,
    });

    expect(() => service1.emettre('mission.publiee', evenement('livraison-4'))).not.toThrow();
  });

  /**
   * La référence doit être stable — on suit un dossier d'un message à l'autre —
   * et ne doit pas laisser deviner l'identifiant dont elle est tirée.
   */
  it('derive une reference candidat stable et non reversible', () => {
    const emetteur = service({ N8N_WEBHOOK_SECRET: SECRET });
    const id = '22222222-2222-4222-8222-222222222222';

    const reference = emetteur.referenceCandidat(id);

    expect(reference).toMatch(/^CAN-[0-9A-F]{6}$/);
    expect(emetteur.referenceCandidat(id)).toBe(reference);
    expect(emetteur.referenceCandidat('33333333-3333-4333-8333-333333333333')).not.toBe(reference);
    expect(reference).not.toContain(id.slice(0, 6));
  });
});
