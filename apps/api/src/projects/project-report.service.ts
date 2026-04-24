import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ProjectReport,
  ProjectReportStatus,
  ProjectReportTemplate,
  ProjectLiveItemPublication,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { OpenrouterService } from '../ai/openrouter.service';
import { VitrineContentService } from '../vitrine/vitrine-content.service';

/**
 * Génère et publie des comptes-rendus de projet (DRAFT → PUBLISHED).
 *
 * Flow :
 *   1. `generate(...)` — construit un prompt scopé par preset (COMPETITIF,
 *      FESTIF, BILAN) avec en contexte : titre, description, sections,
 *      items live APPROVED. Appelle OpenRouter, parse en structure Tiptap
 *      minimaliste (heading + paragraph + image). Crée un `ProjectReport`
 *      status=DRAFT avec `sourceLiveItemIds` et `sourceContributor*Ids`
 *      pour les crédits.
 *   2. `update(...)` — édite bodyJson / template tant que status=DRAFT.
 *   3. `publish(...)` — crée une `VitrineArticle` (NEWS ou BLOG) ou une
 *      `ClubAnnouncement` selon la cible, injecte en queue de bodyJson un
 *      bloc « Avec les contributions de X, Y, Z » si
 *      `ClubProject.showContributorCredits` est activé. Passe le report en
 *      PUBLISHED et garde `publishedRefId` pour retour vers la ressource.
 *
 * Contraintes :
 *   - Les presets déterminent le ton mais pas la structure : le modèle
 *     renvoie un JSON strict `{ title, subtitle?, sections: [{h2, paragraphs}] }`
 *     que l'on convertit en Tiptap JSON avec `buildTiptapFromOutline()`.
 *   - La publication n'ajoute JAMAIS l'attribution si
 *     `showContributorCredits=false` — respect RGPD des contributeurs qui
 *     ne veulent pas apparaître nominativement.
 *   - On ne publie pas automatiquement : toute publication passe par un
 *     clic admin explicite après revue du draft.
 */
@Injectable()
export class ProjectReportService {
  private readonly logger = new Logger(ProjectReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
    private readonly openrouter: OpenrouterService,
    private readonly vitrine: VitrineContentService,
  ) {}

  // ---------- Queries ----------

  async listForProject(
    clubId: string,
    projectId: string,
  ): Promise<ProjectReport[]> {
    return this.prisma.projectReport.findMany({
      where: { projectId, project: { clubId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForClub(
    clubId: string,
    reportId: string,
  ): Promise<ProjectReport> {
    const report = await this.prisma.projectReport.findFirst({
      where: { id: reportId, project: { clubId } },
    });
    if (!report) throw new NotFoundException('Compte-rendu introuvable.');
    return report;
  }

  // ---------- Mutations ----------

  /**
   * Génère un brouillon IA. Fire-and-forget côté resolver : on retourne
   * la ligne créée une fois la génération terminée (synchrone ici car
   * ≤ 30 s de génération sur un preset standard). À passer en mode PENDING
   * + background job quand on aura > 1 requête simultanée / club.
   */
  async generate(
    clubId: string,
    userId: string,
    projectId: string,
    template: ProjectReportTemplate,
    customPrompt?: string | null,
    agentConversationId?: string | null,
  ): Promise<ProjectReport> {
    // Garde-fou : un template CUSTOM impose un prompt, les presets l'ignorent.
    const trimmedPrompt = customPrompt?.trim() ?? '';
    if (template === 'CUSTOM' && !trimmedPrompt) {
      throw new BadRequestException(
        'Fournis un prompt personnalisé pour une génération « sur-mesure ».',
      );
    }
    if (template === 'CUSTOM' && trimmedPrompt.length > 2000) {
      throw new BadRequestException(
        'Prompt trop long (max 2000 caractères).',
      );
    }
    const project = await this.prisma.clubProject.findFirst({
      where: { id: projectId, clubId },
      select: {
        id: true,
        title: true,
        summary: true,
        description: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const approvedItems = await this.prisma.projectLiveItem.findMany({
      where: {
        projectId,
        humanDecision: 'APPROVED',
      },
      include: {
        contributor: {
          select: {
            memberId: true,
            contactId: true,
            member: { select: { firstName: true, lastName: true } },
            contact: { select: { firstName: true, lastName: true } },
          },
        },
        mediaAsset: {
          select: { publicUrl: true, mimeType: true },
        },
      },
      orderBy: { submittedAt: 'asc' },
      take: 60, // garde-fou : prompt limité même sur gros projets
    });

    // Crédits : déduplication des contributeurs cités.
    const memberIds = new Set<string>();
    const contactIds = new Set<string>();
    const contributorNames: string[] = [];
    const seenLabels = new Set<string>();
    for (const item of approvedItems) {
      if (item.contributor.memberId) memberIds.add(item.contributor.memberId);
      if (item.contributor.contactId) contactIds.add(item.contributor.contactId);
      const person = item.contributor.member ?? item.contributor.contact;
      if (person) {
        const label = [person.firstName, person.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (label && !seenLabels.has(label)) {
          seenLabels.add(label);
          contributorNames.push(label);
        }
      }
    }

    const outline = await this.generateOutline({
      clubId,
      userId,
      template,
      customPrompt: trimmedPrompt || null,
      project,
      approvedItemsCount: approvedItems.length,
      contributorNames,
    });

    const bodyJson = this.buildTiptapFromOutline(outline, approvedItems);

    return this.prisma.projectReport.create({
      data: {
        projectId,
        template,
        status: 'DRAFT',
        title: outline.title,
        customPrompt: template === 'CUSTOM' ? trimmedPrompt : null,
        bodyJson: bodyJson as unknown as Prisma.InputJsonValue,
        sourceLiveItemIds: approvedItems.map((i) => i.id),
        sourceContributorMemberIds: Array.from(memberIds),
        sourceContributorContactIds: Array.from(contactIds),
        generatedByAgentConversationId: agentConversationId ?? null,
        createdByUserId: userId,
      },
    });
  }

  async update(
    clubId: string,
    reportId: string,
    patch: {
      template?: ProjectReportTemplate;
      bodyJson?: Prisma.InputJsonValue;
    },
  ): Promise<ProjectReport> {
    const report = await this.getByIdForClub(clubId, reportId);
    if (report.status === 'PUBLISHED') {
      throw new BadRequestException(
        "Impossible de modifier un compte-rendu déjà publié. Dépubliez-le d'abord.",
      );
    }
    return this.prisma.projectReport.update({
      where: { id: report.id },
      data: {
        template: patch.template,
        bodyJson:
          patch.bodyJson === undefined ? undefined : patch.bodyJson,
      },
    });
  }

  async delete(clubId: string, reportId: string): Promise<boolean> {
    const report = await this.prisma.projectReport.findFirst({
      where: { id: reportId, project: { clubId } },
      select: { id: true, status: true },
    });
    if (!report) return false;
    if (report.status === 'PUBLISHED') {
      throw new BadRequestException(
        'Un compte-rendu publié doit être dépublié avant suppression.',
      );
    }
    await this.prisma.projectReport.delete({ where: { id: report.id } });
    return true;
  }

  /**
   * Publie un brouillon vers un article vitrine (NEWS ou BLOG) ou une
   * annonce membre. Injecte l'attribution des contributeurs en queue
   * de bodyJson si le projet a `showContributorCredits=true`.
   */
  async publish(
    clubId: string,
    userId: string,
    reportId: string,
    target: ProjectLiveItemPublication,
  ): Promise<ProjectReport> {
    if (target === 'NONE') {
      throw new BadRequestException(
        'Cible de publication invalide (NONE).',
      );
    }
    const report = await this.getByIdForClub(clubId, reportId);
    if (report.status === 'PUBLISHED') return report;

    const project = await this.prisma.clubProject.findFirst({
      where: { id: report.projectId, clubId },
      select: { title: true, summary: true, showContributorCredits: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    const finalBodyJson: TiptapDoc = project.showContributorCredits
      ? await this.appendContributorCredits(report)
      : (report.bodyJson as unknown as TiptapDoc);

    let publishedRefId: string | null = null;

    if (target === 'VITRINE_NEWS' || target === 'VITRINE_BLOG') {
      const article = await this.vitrine.createArticle(clubId, userId, {
        title: this.extractTitle(finalBodyJson) ?? report.title ?? project.title,
        excerpt: project.summary ?? null,
        bodyJson: finalBodyJson as unknown as Prisma.InputJsonValue,
        channel: target === 'VITRINE_NEWS' ? 'NEWS' : 'BLOG',
        publishNow: true,
      });
      publishedRefId = article.id;
    } else if (target === 'MEMBER_ANNOUNCEMENT') {
      const announcement = await this.prisma.clubAnnouncement.create({
        data: {
          clubId,
          authorUserId: userId,
          title: this.extractTitle(finalBodyJson) ?? report.title ?? project.title,
          body: this.tiptapToPlainText(finalBodyJson).slice(0, 4000),
          publishedAt: new Date(),
        },
      });
      publishedRefId = announcement.id;
    }

    return this.prisma.projectReport.update({
      where: { id: report.id },
      data: {
        status: 'PUBLISHED',
        publishedTo: target,
        publishedRefId,
        publishedAt: new Date(),
      },
    });
  }

  // ---------- Helpers privés ----------

  /**
   * Retire le tag PUBLISHED → DRAFT. Utile si l'admin veut ré-éditer un
   * compte-rendu déjà publié sans casser la publication (l'article
   * vitrine reste en ligne, on décorrèle simplement le draft pour édition).
   */
  async unpublish(
    clubId: string,
    reportId: string,
  ): Promise<ProjectReport> {
    const report = await this.getByIdForClub(clubId, reportId);
    if (report.status === 'DRAFT') return report;
    return this.prisma.projectReport.update({
      where: { id: report.id },
      data: { status: 'DRAFT' as ProjectReportStatus },
    });
  }

  private async generateOutline(args: {
    clubId: string;
    userId: string;
    template: ProjectReportTemplate;
    customPrompt: string | null;
    project: {
      title: string;
      summary: string | null;
      description: string | null;
      startsAt: Date | null;
      endsAt: Date | null;
    };
    approvedItemsCount: number;
    contributorNames: string[];
  }): Promise<ReportOutline> {
    const { clubId, userId, template, customPrompt, project } = args;
    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const { textModel } = await this.aiSettings.getModels(clubId);

    const toneByTemplate: Record<
      Exclude<ProjectReportTemplate, 'CUSTOM'>,
      string
    > = {
      COMPETITIF:
        'compétitif et factuel — résultats, scores, performances, citations des athlètes',
      FESTIF:
        'festif et chaleureux — émotions, ambiance, remerciements, moments marquants',
      BILAN:
        'bilan analytique — objectifs, résultats mesurables, écarts, enseignements, perspectives',
    };

    // Préambule : pour CUSTOM on laisse l'admin piloter le ton via son prompt,
    // sinon on injecte la directive de ton du preset choisi.
    const preambleInstruction =
      template === 'CUSTOM' && customPrompt
        ? `Demande spécifique de l'admin : ${customPrompt}`
        : `Ton : ${toneByTemplate[template as Exclude<ProjectReportTemplate, 'CUSTOM'>]}.`;

    const system = `Tu rédiges le compte-rendu d'un événement/projet de club en français. ${preambleInstruction}

Règles :
- Structure : 3-5 sections H2 courts + paragraphes de 30-80 mots.
- Pas de fausses citations : n'invente pas de témoignages directs.
- Ne liste pas de noms de contributeurs : l'attribution sera ajoutée automatiquement en fin de compte-rendu.
- Langue : français, tutoiement exclu, ton professionnel mais humain.
- Reste fidèle à la demande : si l'admin cible un sujet précis (ex. performances des athlètes), concentre-toi exclusivement dessus.

Réponse STRICTEMENT au format JSON (pas de markdown autour) :
{
  "title": "Titre du compte-rendu",
  "subtitle": "Sous-titre optionnel (ou null)",
  "sections": [
    { "h2": "Titre de la section", "paragraphs": ["Paragraphe 1.", "Paragraphe 2."] }
  ]
}`;

    const user = [
      `Projet : ${project.title}`,
      project.summary ? `Pitch : ${project.summary}` : null,
      project.description ? `Description : ${project.description}` : null,
      project.startsAt
        ? `Période : ${formatDate(project.startsAt)} → ${formatDate(project.endsAt ?? project.startsAt)}`
        : null,
      `Nombre de photos/vidéos validées côté contributeurs : ${args.approvedItemsCount}`,
      args.contributorNames.length > 0
        ? `Contributeurs (pour info — ne PAS citer nominativement) : ${args.contributorNames.slice(0, 20).join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await this.openrouter.chatCompletion({
      apiKey,
      model: textModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      maxTokens: 2500,
      responseFormat: 'json_object',
    });

    void this.aiSettings
      .logUsage({
        clubId,
        userId,
        feature: 'PROJECT_REPORT',
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        imagesGenerated: 0,
        costCents: completion.costCents,
      })
      .catch((err) =>
        this.logger.warn(
          `logUsage PROJECT_REPORT failed : ${err instanceof Error ? err.message : err}`,
        ),
      );

    return parseOutline(completion.content);
  }

  /**
   * Construit un bodyJson Tiptap minimaliste depuis l'outline IA. Les
   * images approuvées sont distribuées entre les sections (max 1 par
   * section) pour enrichir visuellement sans surcharger.
   */
  private buildTiptapFromOutline(
    outline: ReportOutline,
    approvedItems: Array<{
      id: string;
      kind: string;
      mediaAsset: { publicUrl: string | null; mimeType: string } | null;
    }>,
  ): TiptapDoc {
    const images = approvedItems
      .filter(
        (i) =>
          i.kind === 'PHOTO' &&
          i.mediaAsset?.publicUrl &&
          i.mediaAsset.mimeType.startsWith('image/'),
      )
      .map((i) => i.mediaAsset!.publicUrl!);

    const content: TiptapNode[] = [];
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: outline.title }],
    });
    if (outline.subtitle) {
      content.push({
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'italic' }], text: outline.subtitle },
        ],
      });
    }

    let imageIndex = 0;
    for (const section of outline.sections) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: section.h2 }],
      });
      for (const p of section.paragraphs) {
        if (!p.trim()) continue;
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: p }],
        });
      }
      if (imageIndex < images.length) {
        content.push({
          type: 'image',
          attrs: { src: images[imageIndex], alt: outline.title },
        });
        imageIndex += 1;
      }
    }

    return { type: 'doc', content };
  }

  /**
   * Append un bloc H2 « Avec les contributions de » + paragraphe avec
   * les noms des contributeurs crédités. On relit Member / Contact en
   * base pour avoir des données à jour (changement de nom, etc.).
   */
  private async appendContributorCredits(
    report: ProjectReport,
  ): Promise<TiptapDoc> {
    const members =
      report.sourceContributorMemberIds.length > 0
        ? await this.prisma.member.findMany({
            where: { id: { in: report.sourceContributorMemberIds } },
            select: { firstName: true, lastName: true },
          })
        : [];
    const contacts =
      report.sourceContributorContactIds.length > 0
        ? await this.prisma.contact.findMany({
            where: { id: { in: report.sourceContributorContactIds } },
            select: { firstName: true, lastName: true },
          })
        : [];
    const names = [
      ...members.map((m) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim()),
      ...contacts.map((c) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()),
    ].filter(Boolean);

    const doc = report.bodyJson as unknown as TiptapDoc;
    if (names.length === 0) return doc;

    const content = [...(doc.content ?? [])];
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Avec les contributions de' }],
    });
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: names.join(', ') + '.' }],
    });
    return { ...doc, content };
  }

  private extractTitle(bodyJson: TiptapDoc | null | undefined): string | null {
    if (!bodyJson || !Array.isArray(bodyJson.content)) return null;
    const h1 = bodyJson.content.find(
      (n) => n.type === 'heading' && n.attrs?.level === 1,
    );
    if (!h1?.content) return null;
    const textNode = h1.content.find((c) => c.type === 'text');
    return textNode?.text?.trim() ?? null;
  }

  private tiptapToPlainText(bodyJson: TiptapDoc | null | undefined): string {
    if (!bodyJson || !Array.isArray(bodyJson.content)) return '';
    const lines: string[] = [];
    for (const node of bodyJson.content) {
      if (node.type === 'paragraph' || node.type === 'heading') {
        const text = (node.content ?? [])
          .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
          .join('');
        if (text.trim()) lines.push(text);
      }
    }
    return lines.join('\n\n');
  }
}

// ---------- Types internes ----------

interface ReportOutline {
  title: string;
  subtitle: string | null;
  sections: Array<{ h2: string; paragraphs: string[] }>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}
interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}

function parseOutline(raw: string): ReportOutline {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Recherche d'un sous-objet JSON dans la string (cas modèles bavards).
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new BadRequestException(
        "Le modèle IA n'a pas renvoyé de JSON exploitable pour le compte-rendu.",
      );
    }
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as Partial<ReportOutline> & {
    sections?: Array<{ h2?: unknown; paragraphs?: unknown }>;
  };
  if (typeof obj.title !== 'string' || !Array.isArray(obj.sections)) {
    throw new BadRequestException(
      'Structure JSON inattendue pour le compte-rendu.',
    );
  }
  const sections = obj.sections
    .map((s) => ({
      h2: typeof s.h2 === 'string' ? s.h2 : '',
      paragraphs: Array.isArray(s.paragraphs)
        ? (s.paragraphs as unknown[]).map((p) =>
            typeof p === 'string' ? p : String(p ?? ''),
          )
        : [],
    }))
    .filter((s) => s.h2.trim().length > 0);
  return {
    title: obj.title.trim(),
    subtitle:
      typeof obj.subtitle === 'string' && obj.subtitle.trim().length > 0
        ? obj.subtitle.trim()
        : null,
    sections,
  };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
