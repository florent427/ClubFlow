import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { VitrineDomainStatus } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CaddyApiService } from '../infra/caddy.service';
import { DnsCheckService } from '../infra/dns-check.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Slugs réservés qui ne peuvent pas être utilisés comme slug de club.
 * Bloque les collisions avec :
 *  - les routes de l'app admin (/dashboard, /settings, etc.)
 *  - les sous-domaines ClubFlow product (api, app, portail, www)
 *  - les noms qui pourraient prêter à confusion (admin, root, etc.)
 *
 * Cf. ADR-0006 (path-based multi-tenant) pour le pourquoi.
 */
const RESERVED_CLUB_SLUGS = new Set<string>([
  'admin',
  'api',
  'app',
  'portail',
  'www',
  'mail',
  'static',
  'assets',
  'public',
  'private',
  'health',
  'status',
  'help',
  'support',
  'signup',
  'signin',
  'login',
  'logout',
  'register',
  'account',
  'billing',
  'settings',
  'dashboard',
  'home',
  'club-modules',
  'members',
  'families',
  'contacts',
  'planning',
  'communication',
  'comms',
  'comptabilite',
  'accounting',
  'documents',
  'shop',
  'agenda',
  'events',
  'sponsoring',
  'subsidies',
  'projects',
  'booking',
  'system',
  'superadmin',
  'root',
  'clubflow',
  'sksr',
  'demo-club',
  'test',
  'staging',
  'dev',
  'production',
  'prod',
]);

/** Modules activés par défaut à la création d'un nouveau club via signup. */
const DEFAULT_MODULES_AT_SIGNUP: ModuleCode[] = [
  ModuleCode.MEMBERS,
  ModuleCode.FAMILIES,
  ModuleCode.COMMUNICATION,
];

@Injectable()
export class ClubsService {
  private readonly logger = new Logger(ClubsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caddy: CaddyApiService,
    private readonly dns: DnsCheckService,
  ) {}

  /**
   * Convertit une chaîne arbitraire en slug kebab-case ASCII (sans accents).
   * Exemples :
   *  - "Karaté Club Saint-Paul" → "karate-club-saint-paul"
   *  - "Foo & Bar !!" → "foo-bar"
   */
  static slugify(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** True si le slug est dans la blacklist des slugs réservés. */
  static isReservedSlug(slug: string): boolean {
    return RESERVED_CLUB_SLUGS.has(slug.toLowerCase());
  }

  /**
   * Génère un slug unique à partir d'un nom + suggestion optionnelle.
   * Stratégie :
   *  1. base = suggestion ou slugify(name)
   *  2. si reserved → throw
   *  3. si pris → essayer base-2, base-3, ... jusqu'à un libre
   *
   * @throws {BadRequestException} si le slug est réservé ou si on n'arrive pas
   *   à trouver un libre après 50 tentatives (cas pathologique).
   */
  async generateUniqueSlug(name: string, suggestion?: string): Promise<string> {
    const base = suggestion?.trim()
      ? ClubsService.slugify(suggestion)
      : ClubsService.slugify(name);

    if (!base) {
      throw new BadRequestException(
        `Impossible de générer un slug à partir de "${name}". Préciser clubSlug.`,
      );
    }
    if (ClubsService.isReservedSlug(base)) {
      throw new BadRequestException(
        `Le slug "${base}" est réservé. Choisir une variante.`,
      );
    }

    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.club.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new BadRequestException(
      `Trop de clubs avec un slug similaire à "${base}". Choisir un nom plus distinctif.`,
    );
  }

  /**
   * Crée un nouveau club avec ses modules par défaut activés.
   * À utiliser depuis `AuthService.createClubAndAdmin`. Ne crée PAS
   * l'utilisateur ni la membership — c'est la responsabilité de l'appelant.
   */
  async createClubWithDefaults(input: {
    name: string;
    slug: string;
  }): Promise<{ id: string; slug: string }> {
    const club = await this.prisma.club.create({
      data: {
        name: input.name,
        slug: input.slug,
        // Vitrine activée par défaut pour qu'au signup le subdomain
        // <slug>.clubflow.topdigital.re affiche immédiatement les pages
        // seedées (sinon le user voit du 404 jusqu'à toggle manuel).
        vitrinePublished: true,
        modules: {
          create: DEFAULT_MODULES_AT_SIGNUP.map((moduleCode) => ({
            moduleCode,
            enabled: true,
            enabledAt: new Date(),
          })),
        },
      },
      select: { id: true, slug: true },
    });
    // Seed pages vitrine par défaut (Accueil, Club, Cours, Contact). Le user
    // peut éditer chaque section via le mode édition en mode admin. Best-effort :
    // si le seed échoue, on log mais on n'échoue pas la création du club.
    try {
      await this.seedDefaultVitrinePages(club.id, input.name);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[createClubWithDefaults] seed vitrine pages failed for club ${club.id} : ${(err as Error).message}`,
      );
    }
    return club;
  }

  /**
   * Crée 4 pages vitrine par défaut pour qu'un nouveau club ait du contenu
   * affichable immédiatement après signup. Idempotent : skip une page si
   * elle existe déjà (clé unique [clubId, slug]).
   *
   * Les sections utilisent des blocs génériques (hero, manifesto, ctaBand,
   * pageHero, richText, cardsGrid, contact) qui rendent du texte placeholder
   * personnalisable via le mode édition admin.
   */
  async seedDefaultVitrinePages(
    clubId: string,
    clubName: string,
  ): Promise<void> {
    const pages = [
      {
        slug: 'accueil',
        seoTitle: clubName,
        seoDescription: `Bienvenue sur le site officiel de ${clubName}.`,
        sections: [
          {
            id: 'hero-1',
            type: 'hero',
            props: {
              eyebrow: 'Bienvenue',
              title: clubName,
              subtitle: 'Notre club vous accueille pour partager une passion commune.',
              ctaPrimary: { label: 'Découvrir le club', href: '/club' },
              ctaSecondary: { label: 'Nos cours', href: '/cours' },
            },
          },
          {
            id: 'manifesto-1',
            type: 'manifesto',
            props: {
              title: 'Notre engagement',
              paragraphs: [
                `Chez ${clubName}, nous croyons en la pratique régulière, le respect mutuel et le plaisir de progresser ensemble.`,
                'Que vous soyez débutant ou confirmé, vous trouverez votre place et votre rythme.',
              ],
            },
          },
          {
            id: 'cta-1',
            type: 'ctaBand',
            props: {
              title: 'Rejoignez-nous',
              subtitle: 'Premiers cours gratuits — venez découvrir.',
              primary: { label: 'Nous contacter', href: '/contact' },
            },
          },
        ],
      },
      {
        slug: 'club',
        seoTitle: `Le club — ${clubName}`,
        seoDescription: `Découvrez l'histoire, les valeurs et l'équipe de ${clubName}.`,
        sections: [
          {
            id: 'pagehero-1',
            type: 'pageHero',
            props: { label: 'Le club', title: clubName, subtitle: 'Notre histoire, nos valeurs.' },
          },
          {
            id: 'richtext-1',
            type: 'richText',
            props: {
              title: 'Notre histoire',
              paragraphs: [
                `${clubName} a été fondé pour rassembler des passionnés autour d'une même pratique.`,
                'Cette page sera personnalisée par le club avec son histoire détaillée.',
              ],
            },
          },
        ],
      },
      {
        slug: 'cours',
        seoTitle: `Nos cours — ${clubName}`,
        seoDescription: 'Découvrez les créneaux, niveaux et tarifs.',
        sections: [
          {
            id: 'pagehero-2',
            type: 'pageHero',
            props: { label: 'Cours', title: 'Nos cours', subtitle: 'Découvrez notre planning hebdomadaire.' },
          },
          {
            id: 'richtext-2',
            type: 'richText',
            props: {
              title: 'Planning à venir',
              paragraphs: [
                "Le planning des cours sera affiché ici dès que l'admin du club l'aura configuré.",
              ],
            },
          },
        ],
      },
      {
        slug: 'contact',
        seoTitle: `Contact — ${clubName}`,
        seoDescription: `Contactez ${clubName}.`,
        sections: [
          {
            id: 'pagehero-3',
            type: 'pageHero',
            props: { label: 'Contact', title: 'Nous contacter' },
          },
          {
            id: 'richtext-3',
            type: 'richText',
            props: {
              title: 'Adresse, téléphone, email',
              paragraphs: [
                'Les coordonnées du club seront affichées ici dès configuration depuis l\'admin (Paramètres → Coordonnées).',
              ],
            },
          },
        ],
      },
    ];
    for (const p of pages) {
      await this.prisma.vitrinePage.upsert({
        where: { clubId_slug: { clubId, slug: p.slug } },
        create: {
          clubId,
          slug: p.slug,
          templateKey: 'sksr-v1',
          status: 'PUBLISHED',
          seoTitle: p.seoTitle,
          seoDescription: p.seoDescription,
          sectionsJson: p.sections as never,
        },
        update: {}, // idempotent : ne touche pas aux pages existantes
      });
    }
  }

  // ============================================================
  // Vitrine custom domain self-service (Phase 3 multi-tenant)
  // ============================================================

  /**
   * Lecture de l'état actuel du domaine custom d'un club.
   * Utilisé par la page admin "Paramètres → Domaine vitrine".
   */
  async getVitrineDomainState(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        customDomain: true,
        customDomainStatus: true,
        customDomainCheckedAt: true,
        customDomainErrorMessage: true,
      },
    });
    if (!club) {
      throw new NotFoundException('Club introuvable.');
    }
    return {
      customDomain: club.customDomain,
      status: club.customDomainStatus,
      checkedAt: club.customDomainCheckedAt,
      errorMessage: club.customDomainErrorMessage,
      expectedIpv4: process.env.CLUBFLOW_PUBLIC_IPV4 ?? '89.167.79.253',
      expectedIpv6:
        process.env.CLUBFLOW_PUBLIC_IPV6 ?? '2a01:4f9:c010:99d3::1',
    };
  }

  /**
   * Déclare un nouveau domaine custom pour la vitrine du club.
   * - normalise (lowercase, strip protocole/path)
   * - vérifie qu'il n'est pas déjà utilisé par un autre club (unique constraint Prisma)
   * - met `customDomainStatus = PENDING_DNS` (pas de Caddy add ici, c'est `verifyVitrineDomain` qui le fait après check DNS)
   */
  async requestVitrineDomain(clubId: string, rawDomain: string) {
    const domain = this.sanitizeDomain(rawDomain);

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { customDomain: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');

    // Si déjà ce même domaine, idempotent
    if (club.customDomain === domain) {
      return this.getVitrineDomainState(clubId);
    }

    // Vérifier que ce domaine n'est pas pris par un autre club
    const taken = await this.prisma.club.findUnique({
      where: { customDomain: domain },
      select: { id: true },
    });
    if (taken && taken.id !== clubId) {
      throw new BadRequestException(
        `Le domaine "${domain}" est déjà utilisé par un autre club.`,
      );
    }

    // Si le club avait déjà un domaine ACTIVE, on le retire de Caddy avant de switch
    if (club.customDomain && club.customDomain !== domain) {
      try {
        await this.caddy.removeVitrineVhost(club.customDomain);
      } catch (err) {
        this.logger.warn(
          `Caddy remove vhost ${club.customDomain} a échoué : ${(err as Error).message}`,
        );
        // best-effort, on continue
      }
    }

    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        customDomain: domain,
        customDomainStatus: VitrineDomainStatus.PENDING_DNS,
        customDomainCheckedAt: null,
        customDomainErrorMessage: null,
      },
    });
    return this.getVitrineDomainState(clubId);
  }

  /**
   * Tente de vérifier le DNS du domaine + ajoute le vhost Caddy si OK.
   *
   * - lit `customDomain` du club
   * - vérifie que A pointe sur l'IP serveur
   * - si OK : appelle `caddy.addVitrineVhost(domain)` → status ACTIVE
   * - sinon : status ERROR avec `errorMessage`
   *
   * Idempotent : on peut le rappeler plusieurs fois (Caddy add est idempotent).
   */
  async verifyVitrineDomain(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { customDomain: true, customDomainStatus: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');
    if (!club.customDomain) {
      throw new BadRequestException(
        "Aucun domaine custom n'est configuré. Utiliser requestVitrineDomain d'abord.",
      );
    }

    const domain = club.customDomain;
    const dns = await this.dns.checkDomain(domain);
    const now = new Date();

    if (!dns.ok) {
      await this.prisma.club.update({
        where: { id: clubId },
        data: {
          customDomainStatus: VitrineDomainStatus.ERROR,
          customDomainCheckedAt: now,
          customDomainErrorMessage: dns.error ?? 'DNS non résolu',
        },
      });
      return this.getVitrineDomainState(clubId);
    }

    // DNS OK : ajouter vhost Caddy. En cas d'échec on bascule en ERROR.
    try {
      await this.caddy.addVitrineVhost(domain);
    } catch (err) {
      const msg = `Caddy add échoué : ${(err as Error).message}`;
      this.logger.error(msg);
      await this.prisma.club.update({
        where: { id: clubId },
        data: {
          customDomainStatus: VitrineDomainStatus.ERROR,
          customDomainCheckedAt: now,
          customDomainErrorMessage: msg,
        },
      });
      return this.getVitrineDomainState(clubId);
    }

    // Tout est OK : ACTIVE (cert TLS Let's Encrypt sera obtenu en arrière-plan)
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        customDomainStatus: VitrineDomainStatus.ACTIVE,
        customDomainCheckedAt: now,
        customDomainErrorMessage: null,
      },
    });
    return this.getVitrineDomainState(clubId);
  }

  /**
   * Retire le domaine custom : remove vhost Caddy + clear champs DB.
   * Le club peut toujours utiliser son sous-domaine fallback `<slug>.clubflow.topdigital.re`.
   */
  async removeVitrineDomain(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { customDomain: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');
    if (!club.customDomain) {
      // Idempotent : déjà sans domaine custom
      return this.getVitrineDomainState(clubId);
    }

    try {
      await this.caddy.removeVitrineVhost(club.customDomain);
    } catch (err) {
      this.logger.warn(
        `Caddy remove vhost ${club.customDomain} a échoué (continue quand même) : ${(err as Error).message}`,
      );
    }

    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        customDomain: null,
        customDomainStatus: VitrineDomainStatus.PENDING_DNS,
        customDomainCheckedAt: null,
        customDomainErrorMessage: null,
      },
    });
    return this.getVitrineDomainState(clubId);
  }

  /**
   * Sanitize un input de domaine : strip protocole/trailing slash/spaces, lowercase.
   * Refuse les chars exotiques.
   */
  private sanitizeDomain(input: string): string {
    let d = input.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\s+/g, '');
    if (
      d.length < 4 ||
      d.length > 253 ||
      !/^[a-z0-9]([a-z0-9-.]*[a-z0-9])?$/.test(d) ||
      !d.includes('.')
    ) {
      throw new BadRequestException(`Domaine invalide : "${input}"`);
    }
    return d;
  }
}
