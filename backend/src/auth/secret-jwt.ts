/**
 * Valeurs de `JWT_SECRET` qui ne sont pas des secrets.
 *
 * Celle du fichier d'exemple, et les placeholders qu'on tape sans reflechir en
 * developpement puis qu'on oublie. La liste est volontairement courte : elle
 * attrape l'oubli, elle ne pretend pas juger de la qualite d'un secret — c'est
 * la longueur qui s'en charge.
 */
const SECRETS_INTERDITS = new Set([
  'a-remplacer-en-production',
  'a-changer',
  'changeme',
  'secret',
  'password',
  'dev',
  'test',
]);

/**
 * Longueur minimale.
 *
 * Le jeton est signe en HS256 : la solidite de la signature est celle du
 * secret, et un secret court se retrouve hors ligne a partir d'un seul jeton
 * capture. 32 caracteres ne sont pas un seuil normatif, c'est le plancher en
 * dessous duquel l'attaque devient realiste sur du materiel courant.
 */
const LONGUEUR_MIN = 32;

/**
 * Verifie le secret de signature au demarrage, ou empeche l'API de demarrer.
 *
 * L'absence etait deja refusee. Ce qui ne l'etait pas, et qui est le vrai
 * danger : la valeur d'exemple, **publiee dans le depot**. Un deploiement qui
 * copie `.env.example` sans le relire demarre avec un secret que tout le monde
 * connait, et n'importe qui peut alors forger un jeton d'administrateur — sans
 * mot de passe, sans trace, et sans que rien ne paraisse anormal.
 *
 * Une absence echoue bruyamment et se corrige dans la minute. Cette valeur-la
 * echouait en silence : c'est pour cela qu'elle est traitee plus severement que
 * l'oubli.
 *
 * Le refus est volontairement fatal. Demarrer en journalisant un avertissement
 * reviendrait a laisser tourner la version dangereuse, et le message se
 * perdrait dans les journaux du premier jour.
 */
export function verifierSecretJwt(secret: string | undefined): string {
  if (!secret) {
    throw new Error('JWT_SECRET est absent : copier .env.example vers backend/.env');
  }

  const valeur = secret.trim();

  if (SECRETS_INTERDITS.has(valeur.toLowerCase())) {
    throw new Error(
      'JWT_SECRET porte encore une valeur d exemple : en generer un (openssl rand -base64 48)',
    );
  }

  if (valeur.length < LONGUEUR_MIN) {
    throw new Error(
      `JWT_SECRET est trop court : ${LONGUEUR_MIN} caracteres au minimum (openssl rand -base64 48)`,
    );
  }

  return valeur;
}
