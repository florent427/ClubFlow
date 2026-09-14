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
 *
 * Le balayage ne lit QUE le corps des classes @InputType(). Il lisait le
 * fichier entier dès qu'il contenait une entrée : les @ObjectType() voisins
 * d'un résolveur — champs de SORTIE, sans validateur à juste titre — le
 * faisaient crier au loup sur 55 champs (livre de caisse, avances des
 * bénévoles). Rouge en permanence, il ne protégeait plus rien.
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

/**
 * Le corps de chaque classe @InputType() : de son décorateur à l'accolade qui
 * ferme la classe, trouvée en COMPTANT les accolades — une option de @Field
 * écrite sur plusieurs lignes ferme une accolade en début de ligne sans fermer
 * la classe.
 */
function corpsDesEntrees(contenu: string): string[] {
  const corps: string[] = [];
  const declaration =
    /@InputType\([^)]*\)(?:\s*@\w+\([^)]*\))*\s*(?:export\s+)?(?:abstract\s+)?class\s+\w+[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = declaration.exec(contenu)) !== null) {
    let profondeur = 1;
    let i = m.index + m[0].length;
    for (; i < contenu.length && profondeur > 0; i += 1) {
      if (contenu[i] === '{') profondeur += 1;
      else if (contenu[i] === '}') profondeur -= 1;
    }
    corps.push(contenu.slice(m.index, i));
  }
  return corps;
}

/** Retourne les champs nus, sous forme « fichier:champ ». */
function champsSansValidateur(contenu: string, fichier: string): string[] {
  const nus: string[] = [];
  for (const corps of corpsDesEntrees(contenu)) {
    // Chaque champ est précédé d'un bloc de décorateurs ; on remonte jusqu'au
    // @Field le plus proche et on cherche un validateur entre les deux.
    const champ = /@Field\([^)]*\)([\s\S]{0,400}?)^\s+(\w+)[!?]:/gm;
    let m: RegExpExecArray | null;
    while ((m = champ.exec(corps)) !== null) {
      const entreDeux = m[1];
      // Un autre @Field entre-temps = le champ précédent n'est pas le nôtre.
      if (entreDeux.includes('@Field(')) continue;
      if (!VALIDATEURS.test(entreDeux)) {
        nus.push(`${path.basename(fichier)}:${m[2]}`);
      }
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

  it('ignore les champs d’un @ObjectType() voisin, mais pas le champ nu de l’entrée', () => {
    const resolveur = `
      @ObjectType()
      export class SoldeGraph {
        @Field(() => Int)
        balanceCents!: number;
      }

      @InputType()
      export class SaisieInput {
        @Field(() => ID)
        @IsUUID()
        accountId!: string;

        @Field(() => Int)
        amountCents!: number;
      }

      @ObjectType()
      export class LigneGraph {
        @Field()
        label!: string;
      }
    `;
    expect(champsSansValidateur(resolveur, 'caisse.resolver.ts')).toEqual([
      'caisse.resolver.ts:amountCents',
    ]);
  });

  it('une option de @Field sur plusieurs lignes ne coupe pas la classe en deux', () => {
    const multiligne = `
      @InputType()
      export class LongueInput {
        @Field(() => Int, {
          nullable: true,
        })
        @IsOptional()
        @IsInt()
        quantite?: number;

        @Field(() => ID)
        reference!: string;
      }
    `;
    expect(champsSansValidateur(multiligne, 'longue.input.ts')).toEqual([
      'longue.input.ts:reference',
    ]);
  });
});
