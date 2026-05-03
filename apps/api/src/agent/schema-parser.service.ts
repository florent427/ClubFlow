import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  AGENT_CLASSIFICATIONS,
  AgentRole,
  AgentToolClassification,
  buildCatalogForRoles,
  getClassification,
} from './classifications';

/**
 * Format d'un tool exposé au LLM selon le standard OpenAI/Anthropic.
 */
export interface LlmTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface ParsedOp {
  name: string;
  kind: 'query' | 'mutation';
  /** Arguments à plat (nom → type GraphQL raw). */
  args: Array<{ name: string; type: string; required: boolean }>;
  /** Type de retour GraphQL (ex. "MemberGraph", "[MemberGraph!]!"). */
  returnType: string;
}

interface ParsedType {
  name: string;
  /** Nom des champs scalaires uniquement (sûrs à sélectionner sans sous-sélection). */
  scalarFields: string[];
}

interface ParsedInputType {
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

/**
 * Parse le fichier `schema.gql` au démarrage pour extraire pour chaque
 * query/mutation ses arguments et leur type (utilisé pour générer les
 * JSON schemas des tools).
 *
 * Les types GraphQL sont convertis en JSON Schema basique :
 *  - String! → string
 *  - Int / Int! → integer
 *  - Boolean / Boolean! → boolean
 *  - Float → number
 *  - ID / ID! → string
 *  - [X] / [X!]! → array
 *  - <Input> → object (type opaque pour le LLM — il passe le JSON et on
 *    valide côté serveur)
 */
@Injectable()
export class AgentSchemaParserService implements OnModuleInit {
  private readonly logger = new Logger(AgentSchemaParserService.name);
  private parsedOps: Map<string, ParsedOp> = new Map();
  private parsedTypes: Map<string, ParsedType> = new Map();
  private parsedInputs: Map<string, ParsedInputType> = new Map();
  /** Noms des types scalaires built-in + custom détectés. */
  private knownScalars = new Set<string>([
    'String',
    'Int',
    'Float',
    'Boolean',
    'ID',
    'DateTime',
    'JSON',
  ]);
  private knownEnums = new Set<string>();

  onModuleInit(): void {
    this.load();
  }

  private load(): void {
    // Le schema est généré par @nestjs/graphql dans src/schema.gql
    const candidates = [
      join(process.cwd(), 'src', 'schema.gql'),
      join(process.cwd(), 'apps', 'api', 'src', 'schema.gql'),
    ];
    const schemaPath = candidates.find((p) => existsSync(p));
    if (!schemaPath) {
      this.logger.warn(
        "schema.gql introuvable — l'agent aura des tools avec paramètres vides.",
      );
      return;
    }
    try {
      const sdl = readFileSync(schemaPath, 'utf-8');
      this.parseSdl(sdl);
      this.logger.log(
        `SDL parsé (${this.parsedOps.size} ops, ${this.parsedTypes.size} types, ${this.parsedInputs.size} inputs, ${this.knownScalars.size} scalaires, ${this.knownEnums.size} enums). Classifications=${AGENT_CLASSIFICATIONS.length}.`,
      );
    } catch (err) {
      this.logger.error(
        `Échec lecture schema.gql : ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private parseSdl(sdl: string): void {
    // Enlève tous les commentaires doc pour ne pas parasiter.
    const cleanedSdl = sdl.replace(/"""[\s\S]*?"""/g, '');

    // 1. Détecte les enums (→ scalar-like dans les sélections).
    const enumRe = /^enum\s+(\w+)\s*\{/gm;
    let em: RegExpExecArray | null;
    while ((em = enumRe.exec(cleanedSdl)) !== null) {
      this.knownEnums.add(em[1]);
    }

    // 2. Détecte les scalar custom.
    const scalarRe = /^scalar\s+(\w+)/gm;
    let sm: RegExpExecArray | null;
    while ((sm = scalarRe.exec(cleanedSdl)) !== null) {
      this.knownScalars.add(sm[1]);
    }

    // 3. Parse les types objets (hors Query/Mutation).
    // Regex : `type Name { ... }` — on capture le nom puis le corps.
    const typeBlockRe = /^type\s+(\w+)(?:\s+implements\s+[^{]+)?\s*\{([^}]*)\}/gm;
    let tm: RegExpExecArray | null;
    while ((tm = typeBlockRe.exec(cleanedSdl)) !== null) {
      const typeName = tm[1];
      const body = tm[2];
      if (typeName === 'Query' || typeName === 'Mutation') continue;
      const scalarFields = this.extractScalarFields(body);
      this.parsedTypes.set(typeName, { name: typeName, scalarFields });
    }

    // 3bis. Parse les input types pour que le LLM voie leurs champs.
    const inputBlockRe = /^input\s+(\w+)\s*\{([^}]*)\}/gm;
    let im: RegExpExecArray | null;
    while ((im = inputBlockRe.exec(cleanedSdl)) !== null) {
      const inputName = im[1];
      const body = im[2];
      const fields: Array<{ name: string; type: string; required: boolean }> = [];
      const fieldRe = /^\s*(\w+)\s*:\s*([A-Za-z0-9_!\[\]]+)/gm;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(body)) !== null) {
        const fieldType = fm[2];
        fields.push({
          name: fm[1],
          type: fieldType,
          required: fieldType.endsWith('!'),
        });
      }
      this.parsedInputs.set(inputName, { name: inputName, fields });
    }

    // 4. Parse les ops Query + Mutation.
    for (const blockHeader of ['type Query', 'type Mutation']) {
      const kind = blockHeader.includes('Mutation') ? 'mutation' : 'query';
      const re = new RegExp(`^${blockHeader}\\s*\\{([^}]*)\\}`, 'm');
      const match = re.exec(cleanedSdl);
      if (!match) continue;
      const body = match[1];
      // Regex op : name(args): ReturnType
      const opRe = /^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*([A-Za-z0-9_!\[\]]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = opRe.exec(body)) !== null) {
        const name = m[1];
        const argsRaw = m[2] ?? '';
        const returnType = m[3];
        const args = this.parseArgs(argsRaw);
        this.parsedOps.set(`${kind}:${name}`, { name, kind, args, returnType });
      }
    }
  }

  /**
   * Parse le corps d'un type et retourne les noms des champs scalaires
   * (String, Int, Boolean, ID, DateTime, enum, scalar custom) —
   * c-à-d tous les champs qu'on peut sélectionner sans sous-sélection.
   */
  private extractScalarFields(body: string): string[] {
    const scalarFields: string[] = [];
    const fieldRe = /^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*([A-Za-z0-9_!\[\]]+)/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      const fieldName = fm[1];
      const rawType = fm[3];
      if (this.isScalarReference(rawType)) {
        scalarFields.push(fieldName);
      }
    }
    return scalarFields;
  }

  private isScalarReference(rawType: string): boolean {
    // Unwrap list et non-null
    const inner = rawType.replace(/!/g, '').replace(/^\[/, '').replace(/\]$/, '');
    return (
      this.knownScalars.has(inner) ||
      this.knownEnums.has(inner) ||
      // Les enums/scalars custom peuvent ne pas être encore détectés à ce point
      // si on n'est pas sûr, on exclut — sera dans le 2e passage via isScalarReferenceStrict.
      false
    );
  }

  private parseArgs(
    raw: string,
  ): Array<{ name: string; type: string; required: boolean }> {
    if (!raw.trim()) return [];
    const parts: string[] = [];
    let depth = 0;
    let buf = '';
    for (const ch of raw) {
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(buf.trim());
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts
      .map((p) => {
        const [name, typeRaw] = p.split(':').map((s) => s.trim());
        if (!name || !typeRaw) return null;
        const required = typeRaw.endsWith('!');
        return { name, type: typeRaw, required };
      })
      .filter((x): x is { name: string; type: string; required: boolean } => !!x);
  }

  /**
   * Construit le catalogue LLM filtré pour les rôles utilisateur donnés.
   * Les tools FORBIDDEN ne sont jamais inclus (absence de classification
   * = FORBIDDEN implicite).
   *
   * Garde anti-doublons : si plusieurs classifications existent pour le
   * même `name`+`kind`, on conserve UNIQUEMENT la première (Claude/Azure
   * rejette l'appel LLM avec 400 "Tool names must be unique" sinon — GLM
   * tolère mais c'est pas portable).
   */
  buildToolsForRoles(roles: AgentRole[]): LlmTool[] {
    const catalog = buildCatalogForRoles(roles);
    const seen = new Set<string>();
    const unique: typeof catalog = [];
    for (const c of catalog) {
      const key = `${c.kind}:${c.name}`;
      if (seen.has(key)) {
        this.logger.warn(
          `Doublon détecté dans AGENT_CLASSIFICATIONS : "${c.name}" (${c.kind}) apparaît plusieurs fois. Conservation de la 1re occurrence seulement.`,
        );
        continue;
      }
      seen.add(key);
      unique.push(c);
    }
    return unique.map((c) => this.classificationToTool(c));
  }

  private classificationToTool(c: AgentToolClassification): LlmTool {
    const parsed = this.parsedOps.get(`${c.kind}:${c.name}`);
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    if (parsed) {
      for (const arg of parsed.args) {
        properties[arg.name] = this.graphqlTypeToJsonSchema(arg.type);
        if (arg.required) required.push(arg.name);
      }
    }
    const riskHint =
      c.risk === 'DESTRUCTIVE'
        ? ' [⚠️ DESTRUCTIVE — l\'utilisateur devra confirmer avant exécution]'
        : c.risk === 'GUARDED'
          ? ' [⚠️ GUARDED — confirmation soft requise]'
          : '';
    return {
      type: 'function',
      function: {
        name: c.name,
        description: `${c.description}${riskHint}`,
        parameters: {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
      },
    };
  }

  private graphqlTypeToJsonSchema(
    t: string,
    depth = 0,
  ): Record<string, unknown> {
    const inner = t.replace(/!/g, '');
    if (inner.startsWith('[')) {
      const child = inner.slice(1, -1);
      return {
        type: 'array',
        items: this.graphqlTypeToJsonSchema(child, depth + 1),
      };
    }
    if (this.knownEnums.has(inner)) {
      return { type: 'string', description: `Enum ${inner}` };
    }
    switch (inner) {
      case 'String':
      case 'ID':
      case 'DateTime':
        return { type: 'string' };
      case 'Int':
        return { type: 'integer' };
      case 'Float':
        return { type: 'number' };
      case 'Boolean':
        return { type: 'boolean' };
      default: {
        // Input object : expand ses champs (récursif) jusqu'à profondeur 3
        const input = this.parsedInputs.get(inner);
        if (input && depth < 3) {
          const properties: Record<string, unknown> = {};
          const required: string[] = [];
          for (const f of input.fields) {
            properties[f.name] = this.graphqlTypeToJsonSchema(f.type, depth + 1);
            if (f.required) required.push(f.name);
          }
          return {
            type: 'object',
            description: `Input ${inner}`,
            properties,
            ...(required.length > 0 ? { required } : {}),
          };
        }
        // Fallback : objet opaque
        return {
          type: 'object',
          description: `Objet de type ${inner} (voir GraphQL schema).`,
          additionalProperties: true,
        };
      }
    }
  }

  /** Utilitaire pour les services : récup classification par nom. */
  classifyToolCall(toolName: string): AgentToolClassification | null {
    // Tools à risk levels → principalement mutations, mais safe queries aussi.
    return (
      getClassification(toolName, 'mutation') ??
      getClassification(toolName, 'query')
    );
  }

  /** Retourne les args parsés d'une op (nom + type GraphQL) ou null. */
  getOpArgs(
    name: string,
    kind: 'query' | 'mutation',
  ): Array<{ name: string; type: string; required: boolean }> | null {
    return this.parsedOps.get(`${kind}:${name}`)?.args ?? null;
  }

  /**
   * Retourne les champs d'un InputType parsé (pour auto-wrap des args
   * aplatis par certains LLM).
   */
  getInputFields(
    inputTypeName: string,
  ): Array<{ name: string; type: string; required: boolean }> | null {
    return this.parsedInputs.get(inputTypeName)?.fields ?? null;
  }

  /**
   * Construit une sélection GraphQL safe pour le retour d'une op.
   * Pour les retours scalaires → chaîne vide (pas de selection).
   * Pour les retours objets → liste des champs scalaires du type.
   * Fallback : "__typename".
   */
  buildSafeSelectionForOp(name: string, kind: 'query' | 'mutation'): string {
    const op = this.parsedOps.get(`${kind}:${name}`);
    if (!op) return '__typename';
    const inner = op.returnType
      .replace(/!/g, '')
      .replace(/^\[/, '')
      .replace(/\]$/, '');
    // Retour scalaire → pas de sélection
    if (this.knownScalars.has(inner) || this.knownEnums.has(inner)) {
      return '';
    }
    const t = this.parsedTypes.get(inner);
    if (!t || t.scalarFields.length === 0) {
      return '__typename';
    }
    return t.scalarFields.join(' ');
  }
}
