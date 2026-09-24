/**
 * Validation d'un SIRET : 14 chiffres dont le dernier est une cle de Luhn.
 *
 * La regle sert a autre chose qu'a faire joli dans un formulaire : le SIRET du
 * client part dans la DPAE et sur la facture. Une coquille saisie a 6 h 30 se
 * paie plus tard en rejet administratif.
 */
export function siretValide(valeur: string): boolean {
  if (!/^\d{14}$/.test(valeur)) {
    return false;
  }

  // Exception documentee : La Poste ne respecte pas la cle de Luhn.
  if (valeur.startsWith('356000000')) {
    return true;
  }

  let somme = 0;

  for (let position = 0; position < 14; position += 1) {
    // On double un chiffre sur deux en partant de la droite : les positions
    // paires de gauche a droite sur une chaine de longueur paire.
    const chiffre = Number(valeur[13 - position]);
    const double = position % 2 === 1 ? chiffre * 2 : chiffre;
    somme += double > 9 ? double - 9 : double;
  }

  return somme % 10 === 0;
}
