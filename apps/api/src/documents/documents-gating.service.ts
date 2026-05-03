import { Injectable } from '@nestjs/common';
import { DocumentsService } from './documents.service';

/**
 * Service de gating des accès dépendant des Documents à signer.
 *
 * Pourquoi ce service est-il séparé de `DocumentsService` ?
 *  - Couplage minimal : les modules métier (events, payments…) qui veulent
 *    "bloquer" une action si un membre n'a pas signé n'ont besoin que d'un
 *    booléen + d'une liste minimale (id + name) pour le message d'erreur.
 *    Ils n'ont pas à manipuler le modèle complet des `ClubDocument`.
 *  - Découplage des responsabilités : la liste des docs à signer dépend
 *    déjà de plusieurs sources (catégorie, validFrom/validTo, minorsOnly,
 *    version, etc.) et seul `DocumentsService.listToSignForViewer` est en
 *    charge de cette logique. Ce wrapper expose une API simple.
 */
@Injectable()
export class DocumentsGatingService {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * Vérifie si l'utilisateur (couplé éventuellement à un membre) a des
   * documents requis non signés pour la version courante.
   *
   * Retourne :
   *  - `count` : nombre de documents en attente.
   *  - `documents` : liste minimale (id + name) — utile pour construire un
   *    message d'erreur lisible côté front.
   *
   * Implémentation : délègue à `DocumentsService.listToSignForViewer` puis
   * réduit à la projection {id, name}.
   */
  async hasUnsignedRequiredDocuments(
    clubId: string,
    userId: string,
    memberId?: string | null,
  ): Promise<{ count: number; documents: { id: string; name: string }[] }> {
    const rows = await this.documents.listToSignForViewer(
      clubId,
      userId,
      memberId ?? null,
    );
    return {
      count: rows.length,
      documents: rows.map((d) => ({ id: d.id, name: d.name })),
    };
  }
}
