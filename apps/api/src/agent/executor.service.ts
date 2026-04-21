import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentRiskLevel } from '@prisma/client';
import type { AgentToolClassification } from './classifications';
import { AGENT_GLOBAL_LIMITS, getToolLimits } from './limits.config';
import { AgentSchemaParserService } from './schema-parser.service';

/**
 * Exécute un tool call en faisant un appel HTTP GraphQL interne au serveur
 * lui-même. Ça permet de réutiliser automatiquement tous les guards
 * existants (`GqlJwtAuthGuard`, `ClubContextGuard`, `ClubAdminRoleGuard`,
 * etc.) sans dupliquer la logique de sécurité.
 *
 * L'executor n'a AUCUN accès direct à la base ou aux services métier.
 * Tout passe par GraphQL avec le JWT du user et le header X-Club-Id.
 */

export interface ExecuteToolOpts {
  classification: AgentToolClassification;
  args: Record<string, unknown>;
  userJwt: string;
  clubId: string;
  /** Sélection GraphQL de retour (ex. "{ id title }"). Si omis, { id }. */
  returnSelection?: string;
}

export interface ExecuteToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

@Injectable()
export class AgentExecutorService {
  private readonly logger = new Logger(AgentExecutorService.name);

  constructor(private readonly parser: AgentSchemaParserService) {}

  /**
   * Vérifie que tous les args `required` sont présents côté LLM avant de
   * créer une pending action ou d'exécuter. Évite les tool calls avec `{}`
   * qui passeraient en pending puis échoueraient au moment de l'exécution.
   */
  checkRequiredArgs(
    classification: AgentToolClassification,
    args: Record<string, unknown>,
  ): { ok: boolean; missing?: string[] } {
    const schemaArgs = this.parser.getOpArgs(
      classification.name,
      classification.kind,
    );
    if (!schemaArgs) return { ok: true };
    const missing: string[] = [];
    for (const a of schemaArgs) {
      if (a.required) {
        const v = args[a.name];
        if (
          v === undefined ||
          v === null ||
          (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
        ) {
          missing.push(a.name);
        }
      }
    }
    return missing.length === 0 ? { ok: true } : { ok: false, missing };
  }

  /** Vérifie les limites hard-codées avant exécution. */
  checkLimits(
    toolName: string,
    args: Record<string, unknown>,
    stats: {
      callsOfThisToolInConversation: number;
    },
  ): { ok: boolean; reason?: string } {
    const limits = getToolLimits(toolName);

    if (
      limits.maxCallsPerConversation !== undefined &&
      stats.callsOfThisToolInConversation >= limits.maxCallsPerConversation
    ) {
      return {
        ok: false,
        reason:
          limits.reason ??
          `Tool "${toolName}" appelé trop de fois dans cette conversation.`,
      };
    }

    if (limits.maxAmountCents !== undefined) {
      // Cherche dans les args un champ `amountCents` / `cents` / `amount` (racine ou dans input)
      const amount = this.findAmountCents(args);
      if (amount !== null && amount > limits.maxAmountCents) {
        return {
          ok: false,
          reason:
            limits.reason ??
            `Montant ${(amount / 100).toFixed(2)} € > plafond ${(limits.maxAmountCents / 100).toFixed(0)} €.`,
        };
      }
    }

    if (limits.maxTargets !== undefined) {
      const targets = this.findTargetsCount(args);
      if (targets !== null && targets > limits.maxTargets) {
        return {
          ok: false,
          reason:
            limits.reason ??
            `Nombre de destinataires (${targets}) > plafond ${limits.maxTargets}.`,
        };
      }
    }

    return { ok: true };
  }

  private findAmountCents(obj: unknown, depth = 0): number | null {
    if (depth > 4 || obj === null || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    for (const key of ['amountCents', 'amount_cents', 'cents']) {
      if (typeof o[key] === 'number') return o[key] as number;
    }
    for (const v of Object.values(o)) {
      const found = this.findAmountCents(v, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  private findTargetsCount(obj: unknown, depth = 0): number | null {
    if (depth > 4 || obj === null || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    for (const key of ['recipientIds', 'memberIds', 'targetIds', 'targets', 'recipients']) {
      const v = o[key];
      if (Array.isArray(v)) return v.length;
    }
    for (const v of Object.values(o)) {
      const found = this.findTargetsCount(v, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  /** Génère une GraphQL operation string à partir du nom + args filtrés contre le schéma. */
  private buildOperation(
    classification: AgentToolClassification,
    argsRaw: Record<string, unknown>,
    returnSelection: string,
  ): { query: string; variables: Record<string, unknown> } {
    const schemaArgs = this.parser.getOpArgs(
      classification.name,
      classification.kind,
    );

    // 1. Filtrer les args : on ne garde que ceux qui existent dans le schéma.
    //    Le LLM peut inventer des args (ex. filtres qui n'existent pas) — on
    //    les ignore silencieusement plutôt que de casser la requête.
    const acceptedArgNames = new Set((schemaArgs ?? []).map((a) => a.name));
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(argsRaw)) {
      if (acceptedArgNames.has(k)) args[k] = v;
    }

    // 2. Construire les variables avec le TYPE GraphQL exact (pas JSON).
    //    Sinon le validateur GraphQL rejette "expected X got JSON".
    const argToType = new Map(
      (schemaArgs ?? []).map((a) => [a.name, a.type]),
    );
    const entries = Object.entries(args);
    const varDefs = entries
      .map(([name]) => `$${name}: ${argToType.get(name) ?? 'String'}`)
      .join(', ');
    const argBinds = entries.map(([name]) => `${name}: $${name}`).join(', ');

    const opKind = classification.kind === 'query' ? 'query' : 'mutation';
    const selection = returnSelection.trim()
      ? `{ ${returnSelection} }`
      : '';
    const query = `${opKind} AgentCall${varDefs ? `(${varDefs})` : ''} {
  ${classification.name}${argBinds ? `(${argBinds})` : ''} ${selection}
}`;
    return { query, variables: args };
  }

  async execute(opts: ExecuteToolOpts): Promise<ExecuteToolResult> {
    if (opts.classification.risk === AgentRiskLevel.FORBIDDEN) {
      return { success: false, error: 'Tool interdit à l\'agent.' };
    }

    // Priorité : returnSelection explicite dans opts > classification > fallback
    const selection =
      opts.returnSelection ??
      opts.classification.returnSelection ??
      this.inferDefaultSelection(opts.classification);
    const { query, variables } = this.buildOperation(
      opts.classification,
      opts.args,
      selection,
    );

    const apiUrl = process.env.INTERNAL_GRAPHQL_URL ?? 'http://localhost:3000/graphql';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        AGENT_GLOBAL_LIMITS.toolCallTimeoutMs,
      );

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.userJwt}`,
          'X-Club-Id': opts.clubId,
          'X-Agent-Call': '1',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const payload = (await res.json()) as {
        data?: Record<string, unknown>;
        errors?: Array<{ message: string }>;
      };
      if (payload.errors && payload.errors.length > 0) {
        return {
          success: false,
          error: payload.errors.map((e) => e.message).join(' · '),
        };
      }
      return {
        success: true,
        data: payload.data?.[opts.classification.name] ?? payload.data,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Timeout (>30s) sur appel GraphQL.' };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Pour les ops sans returnSelection explicite, on génère automatiquement
   * une sélection safe à partir des types scalaires du retour (parsés depuis
   * le schéma au démarrage). Retours scalars (Boolean/Int/String) → '' vide,
   * retours objets → tous les champs scalaires concaténés.
   */
  private inferDefaultSelection(c: AgentToolClassification): string {
    return this.parser.buildSafeSelectionForOp(c.name, c.kind);
  }

  /** Génère un preview FR lisible pour une PendingAction. */
  buildPreview(
    classification: AgentToolClassification,
    args: Record<string, unknown>,
  ): string {
    const pretty = JSON.stringify(args, null, 2);
    const truncated = pretty.length > 800 ? pretty.slice(0, 800) + '\n  ...(tronqué)' : pretty;
    return [
      `Action demandée : ${classification.description}`,
      `Outil : ${classification.name}`,
      `Risque : ${classification.risk}`,
      `Paramètres :`,
      truncated,
    ].join('\n');
  }
}
