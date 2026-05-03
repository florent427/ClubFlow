import { Field, ID, InputType, registerEnumType } from '@nestjs/graphql';
import { MemberClubRole, MembershipRole } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * Filtre d'âge appliqué à l'audience d'une campagne.
 * - ALL    : tous les membres (pas de filtre âge)
 * - ADULTS : membres ≥ 18 ans à la date courante
 * - MINORS : membres < 18 ans
 */
export enum AudienceAgeFilter {
  ALL = 'ALL',
  ADULTS = 'ADULTS',
  MINORS = 'MINORS',
}
registerEnumType(AudienceAgeFilter, { name: 'AudienceAgeFilter' });

/**
 * Définition d'une audience riche pour une MessageCampaign. Tous les
 * critères sont COMBINÉS PAR UNION (= un membre matchant N'IMPORTE
 * QUEL critère est inclus). Si tout est vide ou `includeAllMembers=true`,
 * l'audience = tous les membres actifs du club.
 */
@InputType()
export class AudienceFilterInput {
  /** Tous les membres actifs du club (override des autres critères). */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  includeAllMembers?: boolean;

  /** IDs des groupes dynamiques (union de tous les membres matchés). */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  dynamicGroupIds?: string[];

  /**
   * Rôles fonctionnels du club (CLUB_ADMIN, BOARD, COACH, TREASURER, etc.).
   * Source : `ClubMembership.role`. Cible les administrateurs, le bureau,
   * les trésoriers, les coachs déclarés en gestion, etc.
   */
  @Field(() => [MembershipRole], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MembershipRole, { each: true })
  membershipRoles?: MembershipRole[];

  /**
   * Rôles "club" portés par le membre lui-même (STUDENT, COACH, BOARD).
   * Source : `MemberRoleAssignment.role`. Distinct des MembershipRole
   * (qui concernent l'accès admin) — ici c'est l'identité du membre dans
   * la vie du club.
   */
  @Field(() => [MemberClubRole], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MemberClubRole, { each: true })
  clubMemberRoles?: MemberClubRole[];

  /** Filtre d'âge : ALL, ADULTS (≥ 18), MINORS (< 18). Défaut ALL. */
  @Field(() => AudienceAgeFilter, { nullable: true })
  @IsOptional()
  @IsEnum(AudienceAgeFilter)
  ageFilter?: AudienceAgeFilter;

  /** Sélection individuelle de membres (chips dans l'UI). */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
