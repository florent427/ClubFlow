import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de reset annuel des signatures.
 *
 * Comportement attendu :
 *  - Le 1er septembre de chaque année à 06h00 UTC, on parcourt tous les
 *    `ClubDocument` actifs flaggés `resetAnnually=true`. Pour chacun :
 *      - on incrémente `version`
 *      - on marque `invalidatedAt = now()` sur tous les `ClubSignedDocument`
 *        actuellement valides pointant sur ce document.
 *  - Effet : la prochaine connexion d'un membre déclenche `listToSignForViewer`,
 *    qui retournera ce document comme à signer (la signature précédente porte
 *    une `version` antérieure).
 *
 * Activation du cron :
 *  - Ce projet n'a actuellement pas `@nestjs/schedule` dans ses dépendances.
 *    Pour activer le cron automatique, installer le package puis enregistrer
 *    `ScheduleModule.forRoot()` dans `AppModule`. Le décorateur `@Cron('0 6 1 9 *')`
 *    pourra alors être ajouté à la méthode `resetYearlySignatures`.
 *  - En attendant, la méthode `resetYearlySignatures` est exposée via la
 *    mutation admin `triggerYearlyDocumentReset` (utile aussi pour test
 *    manuel après installation du cron).
 */
@Injectable()
export class DocumentsCronService {
  private readonly logger = new Logger('DocumentsCronService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bump la version + invalide les signatures pour tous les documents
   * `resetAnnually=true` actifs. À déclencher chaque 1er septembre 06h UTC
   * via cron (à activer manuellement quand `@nestjs/schedule` sera ajouté
   * au projet — voir docstring de classe).
   *
   * Si `clubId` est fourni, l'opération est restreinte à un seul club
   * (utile pour un déclenchement admin manuel). Sinon, l'opération
   * couvre tous les clubs (mode cron global).
   *
   * Idempotent : un 2e appel ne refait rien d'observable côté membre s'il
   * n'y a pas de nouvelles signatures entre deux passages (les signatures
   * sont déjà invalidatedAt != null et donc filtrées par le service).
   *
   * Retourne le nombre de documents reset + le nombre de signatures
   * invalidées (pour les logs ops).
   */
  async resetYearlySignatures(
    clubId?: string,
  ): Promise<{
    documentsReset: number;
    signaturesInvalidated: number;
  }> {
    const now = new Date();
    const docs = await this.prisma.clubDocument.findMany({
      where: {
        isActive: true,
        resetAnnually: true,
        ...(clubId ? { clubId } : {}),
      },
      select: { id: true },
    });
    if (docs.length === 0) {
      this.logger.log(
        `documents.cron.reset_yearly skipped: no document with resetAnnually=true${clubId ? ` (clubId=${clubId})` : ''}`,
      );
      return { documentsReset: 0, signaturesInvalidated: 0 };
    }

    const docIds = docs.map((d) => d.id);
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Bump la version de chaque document concerné.
      //    On itère pour conserver les autres champs (et déclencher updatedAt).
      for (const id of docIds) {
        await tx.clubDocument.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
      }
      // 2. Invalide toutes les signatures actuellement valides de ces docs.
      const invalidated = await tx.clubSignedDocument.updateMany({
        where: { documentId: { in: docIds }, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      return { signaturesInvalidated: invalidated.count };
    });

    this.logger.log(
      `documents.cron.reset_yearly documents=${docIds.length} signaturesInvalidated=${result.signaturesInvalidated}${clubId ? ` clubId=${clubId}` : ''}`,
    );
    return {
      documentsReset: docIds.length,
      signaturesInvalidated: result.signaturesInvalidated,
    };
  }
}
