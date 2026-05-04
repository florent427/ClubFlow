import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleCode } from '../domain/module-registry/module-codes';
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
  constructor(private readonly prisma: PrismaService) {}

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
    return club;
  }
}
