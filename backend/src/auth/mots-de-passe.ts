import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id, recommande par l'ANSSI et la CNIL pour le stockage de mots de
 * passe. Les parametres par defaut de @node-rs/argon2 suivent l'OWASP ; on les
 * centralise ici pour n'avoir qu'un endroit a faire evoluer.
 */
export function hacherMotDePasse(motDePasse: string): Promise<string> {
  return hash(motDePasse);
}

export async function verifierMotDePasse(empreinte: string, motDePasse: string): Promise<boolean> {
  try {
    return await verify(empreinte, motDePasse);
  } catch {
    // Empreinte illisible (donnee corrompue, ancien format) : on refuse.
    return false;
  }
}
