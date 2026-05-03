import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { VitrineComment, VitrineCommentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommentModerationService,
  type CommentDecision,
  type ModerationResult,
} from '../ai/comment-moderation.service';
import { CommentReplyService } from '../ai/comment-reply.service';
import { AiSettingsService } from '../ai/ai-settings.service';

export interface SubmitCommentInput {
  articleSlug: string;
  clubSlug: string;
  authorName: string;
  authorEmail: string;
  body: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Honeypot — si rempli c'est un bot. */
  websiteHoneypot?: string;
}

export interface SubmitCommentResult {
  success: boolean;
  commentId?: string;
  status: VitrineCommentStatus;
  message: string;
}

/**
 * CRUD + pipeline de modération IA pour les commentaires publics sur les
 * articles vitrine.
 *
 * Flow :
 *   1. Visiteur soumet via `/graphql submitArticleComment` (public, rate-limité)
 *   2. Anti-spam basique : honeypot, longueurs, email valide
 *   3. Comment créé en DB avec status=PENDING
 *   4. Promise fire-and-forget lance la modération IA
 *   5. IA décide : APPROVE → APPROVED (visible) | NEEDS_REVIEW | REJECT | SPAM
 *   6. Admin peut overrider manuellement depuis `/vitrine/commentaires`
 */
@Injectable()
export class VitrineCommentService {
  private readonly logger = new Logger(VitrineCommentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: CommentModerationService,
    private readonly replyGen: CommentReplyService,
    private readonly aiSettings: AiSettingsService,
  ) {}

  /**
   * Soumission d'un commentaire par un visiteur anonyme.
   */
  async submit(input: SubmitCommentInput): Promise<SubmitCommentResult> {
    // --- Anti-spam basique ---
    if (input.websiteHoneypot && input.websiteHoneypot.trim().length > 0) {
      this.logger.warn(
        `Honeypot rempli (probable bot) sur ${input.articleSlug} par ${input.authorEmail}`,
      );
      return {
        success: true,
        status: 'SPAM',
        message: 'Commentaire reçu.',
      };
    }
    const name = input.authorName.trim();
    const email = input.authorEmail.trim().toLowerCase();
    const body = input.body.trim();

    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException('Nom invalide (2-80 caractères).');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Email invalide.');
    }
    if (body.length < 10 || body.length > 3000) {
      throw new BadRequestException('Commentaire 10-3000 caractères requis.');
    }
    // Pas plus de 3 URLs dans un commentaire (heuristique anti-spam)
    const urlCount = (body.match(/https?:\/\//g) ?? []).length;
    if (urlCount > 3) {
      throw new BadRequestException(
        'Trop de liens dans le commentaire (max 3).',
      );
    }

    // --- Article lookup ---
    const club = await this.prisma.club.findUnique({
      where: { slug: input.clubSlug },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    const article = await this.prisma.vitrineArticle.findFirst({
      where: {
        clubId: club.id,
        slug: input.articleSlug,
        status: 'PUBLISHED',
        publishedAt: { not: null },
      },
      select: { id: true, title: true, excerpt: true },
    });
    if (!article) {
      throw new NotFoundException('Article introuvable ou non publié.');
    }

    // --- Rate-limit custom : pas + de 3 commentaires du même email sur le
    //     même article dans les 10 minutes ---
    const recentCount = await this.prisma.vitrineComment.count({
      where: {
        articleId: article.id,
        authorEmail: email,
        createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
      },
    });
    if (recentCount >= 3) {
      throw new BadRequestException(
        'Trop de commentaires récents — merci de patienter quelques minutes.',
      );
    }

    // --- Création en PENDING ---
    const comment = await this.prisma.vitrineComment.create({
      data: {
        articleId: article.id,
        authorName: name,
        authorEmail: email,
        body,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        status: 'PENDING',
      },
    });

    // --- Lance la modération IA en arrière-plan ---
    this.runModeration(comment.id, club.id, body, article).catch((err) => {
      this.logger.error(
        `Modération commentaire ${comment.id} crashée`,
        err instanceof Error ? err.stack : String(err),
      );
    });

    return {
      success: true,
      commentId: comment.id,
      status: 'PENDING',
      message:
        'Ton commentaire a été reçu et est en cours de modération. Il apparaîtra sous peu s\u2019il est validé.',
    };
  }

  /** Pipeline de modération : appelle l'IA puis met à jour le commentaire. */
  private async runModeration(
    commentId: string,
    clubId: string,
    body: string,
    article: { title: string; excerpt: string | null },
  ): Promise<void> {
    let result: ModerationResult;
    try {
      const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
      const { textModel } = await this.aiSettings.getModels(clubId);
      result = await this.moderation.moderate({
        apiKey,
        textModel,
        commentBody: body,
        articleTitle: article.title,
        articleExcerpt: article.excerpt ?? undefined,
      });
    } catch (err) {
      // Pas de clé IA / modèle pas configuré → fallback NEEDS_REVIEW
      this.logger.warn(
        `Modération IA impossible (${err instanceof Error ? err.message : String(err)}). Flag NEEDS_REVIEW.`,
      );
      result = {
        decision: 'NEEDS_REVIEW',
        score: 0.5,
        category: 'other',
        reason:
          'Configuration IA manquante — validation manuelle requise par défaut.',
      };
    }

    const status = this.decisionToStatus(result.decision);
    await this.prisma.vitrineComment.update({
      where: { id: commentId },
      data: {
        status,
        aiScore: result.score,
        aiCategory: result.category,
        aiReason: result.reason,
        reviewedAt: status === 'APPROVED' ? new Date() : null,
      },
    });
    this.logger.log(
      `Commentaire ${commentId} modéré : ${result.decision} (score=${result.score.toFixed(2)}, cat=${result.category})`,
    );
  }

  private decisionToStatus(decision: CommentDecision): VitrineCommentStatus {
    switch (decision) {
      case 'APPROVE':
        return 'APPROVED';
      case 'REJECT':
        return 'REJECTED';
      case 'SPAM':
        return 'SPAM';
      case 'NEEDS_REVIEW':
      default:
        return 'NEEDS_REVIEW';
    }
  }

  // ============ Admin ============

  /** Liste admin — filtrable par statut. */
  async listAdminByClub(
    clubId: string,
    status?: VitrineCommentStatus | 'ALL',
  ): Promise<VitrineComment[]> {
    return this.prisma.vitrineComment.findMany({
      where: {
        article: { clubId },
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async countAdminByClub(
    clubId: string,
    status: VitrineCommentStatus,
  ): Promise<number> {
    return this.prisma.vitrineComment.count({
      where: { article: { clubId }, status },
    });
  }

  /** Approuver / rejeter manuellement par un admin. */
  async setStatus(
    clubId: string,
    commentId: string,
    status: VitrineCommentStatus,
    reviewedByUserId: string,
  ): Promise<VitrineComment> {
    const existing = await this.prisma.vitrineComment.findFirst({
      where: { id: commentId, article: { clubId } },
    });
    if (!existing) throw new NotFoundException('Commentaire introuvable');
    return this.prisma.vitrineComment.update({
      where: { id: existing.id },
      data: {
        status,
        reviewedByUserId,
        reviewedAt: new Date(),
      },
    });
  }

  async delete(clubId: string, commentId: string): Promise<boolean> {
    const existing = await this.prisma.vitrineComment.findFirst({
      where: { id: commentId, article: { clubId } },
    });
    if (!existing) return false;
    await this.prisma.vitrineComment.delete({ where: { id: existing.id } });
    return true;
  }

  // ============ Public (site vitrine) ============

  /** Liste commentaires APPROVED d'un article publié. */
  async listPublicByArticle(
    clubId: string,
    articleSlug: string,
  ): Promise<VitrineComment[]> {
    const article = await this.prisma.vitrineArticle.findFirst({
      where: {
        clubId,
        slug: articleSlug,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });
    if (!article) return [];
    return this.prisma.vitrineComment.findMany({
      where: {
        articleId: article.id,
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async countPublicByArticle(
    clubId: string,
    articleSlug: string,
  ): Promise<number> {
    const article = await this.prisma.vitrineArticle.findFirst({
      where: {
        clubId,
        slug: articleSlug,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });
    if (!article) return 0;
    return this.prisma.vitrineComment.count({
      where: { articleId: article.id, status: 'APPROVED' },
    });
  }

  // ============ Réponses admin (IA + manuelles) ============

  /**
   * Génère une réponse IA à un commentaire (ne la publie pas — retourne
   * juste le texte pour que l'admin la relise avant de la publier).
   */
  async generateReplyDraft(
    clubId: string,
    commentId: string,
    replyAuthorName: string | null,
  ): Promise<string> {
    const comment = await this.prisma.vitrineComment.findFirst({
      where: { id: commentId, article: { clubId } },
      include: {
        article: {
          select: {
            title: true,
            excerpt: true,
            seoKeywords: true,
            club: { select: { name: true } },
          },
        },
      },
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable');

    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const { textModel } = await this.aiSettings.getModels(clubId);

    const reply = await this.replyGen.generate({
      apiKey,
      textModel,
      commentBody: comment.body,
      commentAuthorName: comment.authorName,
      articleTitle: comment.article.title,
      articleExcerpt: comment.article.excerpt,
      articleKeywords: comment.article.seoKeywords,
      clubName: comment.article.club.name,
      replyAuthorName:
        replyAuthorName?.trim() ||
        `L'équipe ${comment.article.club.name}`,
    });
    return reply;
  }

  /**
   * Enregistre une réponse admin (manuelle ou pré-générée IA) sur un
   * commentaire. Passée = visible publiquement sous le commentaire.
   * Body vide/null = retire la réponse existante.
   */
  async setReply(
    clubId: string,
    commentId: string,
    input: {
      replyBody: string | null;
      replyAuthorName: string | null;
    },
  ) {
    const existing = await this.prisma.vitrineComment.findFirst({
      where: { id: commentId, article: { clubId } },
    });
    if (!existing) throw new NotFoundException('Commentaire introuvable');

    const body = input.replyBody?.trim();
    return this.prisma.vitrineComment.update({
      where: { id: existing.id },
      data: {
        adminReplyBody: body ? body : null,
        adminReplyAuthorName: body
          ? (input.replyAuthorName?.trim() || 'L\u2019équipe')
          : null,
        adminReplyAt: body ? new Date() : null,
      },
    });
  }
}
