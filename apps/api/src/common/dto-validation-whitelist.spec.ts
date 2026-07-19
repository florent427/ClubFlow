import * as fs from 'fs';
import * as path from 'path';

/**
 * Tout champ d'un @InputType() DOIT porter au moins un décorateur
 * class-validator.
 *
 * Le ValidationPipe global tourne en `whitelist: true` +
 * `forbidNonWhitelisted: true` (main.ts). Un champ sans décorateur n'est donc
 * pas « simplement non validé » : il est REJETÉ comme propriété inconnue, et
 * la mutation entière renvoie 400 « property X should not exist ».
 *
 * Ce test existe parce que la classe de bug a mordu deux fois :
 *   - `UpdateShopProductInput.id` n'a jamais eu de décorateur depuis le
 *     premier commit du dépôt. `updateShopProduct` n'a JAMAIS fonctionné.
 *   - Les cinq DTO de déclinaisons livrés le 2026-07-20 avaient le même trou,
 *     rendant toute la gestion des variantes inutilisable.
 *
 * Aucun test unitaire ne pouvait l'attraper : ils appellent les services
 * directement et court-circuitent le pipe. Seul un appel HTTP réel — ou ce
 * balayage statique — le voit.
 */

const SRC = path.join(__dirname, '..');

const VALIDATEURS =
  /@(Is[A-Z]\w*|Min\b|Max\b|MinLength|MaxLength|Length|Matches|Array\w+|ValidateNested|ValidateIf|Type|Allow)\s*\(/;

function fichiersTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return fichiersTs(p);
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** Retourne les champs nus, sous forme « fichier:champ ». */
function champsSansValidateur(contenu: string, fichier: string): string[] {
  if (!contenu.includes('@InputType()')) return [];

  const nus: string[] = [];
  // Chaque champ est précédé d'un bloc de décorateurs ; on remonte jusqu'au
  // @Field le plus proche et on cherche un validateur entre les deux.
  const champ = /@Field\([^)]*\)([\s\S]{0,400}?)^\s+(\w+)[!?]:/gm;
  let m: RegExpExecArray | null;
  while ((m = champ.exec(contenu)) !== null) {
    const entreDeux = m[1];
    // Un autre @Field entre-temps = le champ précédent n'est pas le nôtre.
    if (entreDeux.includes('@Field(')) continue;
    if (!VALIDATEURS.test(entreDeux)) {
      nus.push(`${path.basename(fichier)}:${m[2]}`);
    }
  }
  return nus;
}

describe('DTO GraphQL — whitelist du ValidationPipe', () => {
  it('aucun champ d’@InputType() ne se passe de décorateur class-validator', () => {
    const nus = fichiersTs(SRC).flatMap((f) =>
      champsSansValidateur(fs.readFileSync(f, 'utf-8'), f),
    );

    // Message explicite : un développeur qui casse ce test doit comprendre
    // POURQUOI sans avoir à lire le fichier.
    expect(nus).toEqual([]);
  });

  it('le balayage MORD : un champ nu est bien détecté', () => {
    // Sans ce second test, une regex cassée rendrait le premier vert pour
    // toujours — il ne trouverait plus jamais rien, et certifierait le
    // contraire de ce qu'il promet.
    const faux = `
      @InputType()
      export class FauxInput {
        @Field(() => ID)
        productId!: string;
      }
    `;
    expect(champsSansValidateur(faux, 'faux.input.ts')).toEqual([
      'faux.input.ts:productId',
    ]);
  });

  it('le balayage ne crie pas au loup sur un champ correctement décoré', () => {
    const bon = `
      @InputType()
      export class BonInput {
        @Field(() => ID)
        @IsUUID()
        productId!: string;
      }
    `;
    expect(champsSansValidateur(bon, 'bon.input.ts')).toEqual([]);
  });
});
