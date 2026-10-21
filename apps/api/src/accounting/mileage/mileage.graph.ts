import { Field, GraphQLISODateTime, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  MileageClaimStatus,
  MileageSettlement,
  MileageVehicleKind,
  TaxReceiptOrganismType,
  TaxReceiptStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { formatIsoDate, parseIsoDate } from '../accounting-fiscal-year.service';
import type {
  ClaimInput,
  ClaimView,
  RecurringTripInput,
  TripInput,
  VehicleInput,
} from './mileage.service';
import type { PendingDonor, TaxReceiptSettings } from './tax-receipts.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Véhicules ───────────────────────────────────────────────────────────

@ObjectType()
export class MileageVehicleGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field({ description: 'Prénom et nom du propriétaire.' })
  memberName!: string;

  @Field()
  label!: string;

  @Field(() => MileageVehicleKind)
  kind!: MileageVehicleKind;

  @Field(() => Int, { nullable: true, description: 'Puissance fiscale (CV).' })
  fiscalHorsepower!: number | null;

  @Field()
  isElectric!: boolean;

  @Field()
  archived!: boolean;
}

@InputType()
export class MileageVehicleInputGraph {
  @Field()
  @IsString()
  @MaxLength(80)
  label!: string;

  @Field(() => MileageVehicleKind)
  @IsEnum(MileageVehicleKind)
  kind!: MileageVehicleKind;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  fiscalHorsepower?: number | null;

  @Field({ defaultValue: false })
  @IsBoolean()
  isElectric!: boolean;
}

// ── Trajets récurrents ──────────────────────────────────────────────────

@ObjectType()
export class MileageRecurringTripGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field(() => ID)
  vehicleId!: string;

  @Field()
  vehicleLabel!: string;

  @Field()
  fromLabel!: string;

  @Field()
  toLabel!: string;

  @Field()
  purpose!: string;

  @Field(() => Int, { description: 'Distance d’un aller, en mètres.' })
  distanceMeters!: number;

  @Field()
  roundTrip!: boolean;

  @Field(() => [Int], {
    description: '1 = lundi … 7 = dimanche ; un jour répété = plusieurs trajets ce jour-là.',
  })
  weekdays!: number[];

  @Field({ description: 'YYYY-MM-DD' })
  startsOn!: string;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD' })
  endsOn!: string | null;

  @Field()
  archived!: boolean;
}

@InputType()
export class MileageRecurringTripInputGraph {
  @Field(() => ID)
  @IsUUID()
  vehicleId!: string;

  @Field()
  @IsString()
  @MaxLength(160)
  fromLabel!: string;

  @Field()
  @IsString()
  @MaxLength(160)
  toLabel!: string;

  @Field()
  @IsString()
  @MaxLength(200)
  purpose!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  distanceMeters!: number;

  @Field({ defaultValue: true })
  @IsBoolean()
  roundTrip!: boolean;

  @Field(() => [Int])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(28)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @Field()
  @Matches(ISO_DATE)
  startsOn!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(ISO_DATE)
  endsOn?: string | null;
}

// ── Notes et déplacements ───────────────────────────────────────────────

@ObjectType()
export class MileageTripGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  vehicleId!: string;

  @Field()
  vehicleLabel!: string;

  @Field({ description: 'YYYY-MM-DD' })
  tripDate!: string;

  @Field()
  fromLabel!: string;

  @Field()
  toLabel!: string;

  @Field()
  purpose!: string;

  @Field(() => Int, { description: 'Distance d’un aller, en mètres.' })
  distanceMeters!: number;

  @Field()
  roundTrip!: boolean;

  @Field(() => Int, { description: 'Distance parcourue (aller-retour compris), en mètres.' })
  totalMeters!: number;

  @Field(() => ID, { nullable: true })
  recurringTripId!: string | null;

  @Field(() => Int, { description: 'Montant figé (validée) ou estimé, en centimes.' })
  amountCents!: number;

  @Field(() => String, { nullable: true, description: 'Ligne du barème appliquée.' })
  scaleLabel!: string | null;
}

@ObjectType()
export class MileageClaimGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field()
  memberName!: string;

  @Field()
  title!: string;

  @Field(() => MileageSettlement)
  settlement!: MileageSettlement;

  @Field(() => MileageClaimStatus)
  status!: MileageClaimStatus;

  @Field(() => String, { nullable: true })
  memberNote!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  submittedAt!: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  reviewedAt!: Date | null;

  @Field(() => String, { nullable: true })
  reviewComment!: string | null;

  @Field(() => Int)
  totalMeters!: number;

  @Field(() => Int, { description: 'Montant figé si validée, sinon estimation au barème.' })
  amountCents!: number;

  @Field({ description: 'Vrai tant que le montant n’est pas figé par la validation.' })
  estimated!: boolean;

  @Field({ description: 'Barème de l’année pas encore publié : montant provisoire.' })
  provisional!: boolean;

  @Field({ description: 'Remboursement payé au bénévole.' })
  reimbursed!: boolean;

  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  @Field(() => ID, { nullable: true })
  taxReceiptId!: string | null;

  @Field(() => String, { nullable: true })
  taxReceiptNumber!: string | null;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD du premier déplacement.' })
  firstTripDate!: string | null;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD du dernier déplacement.' })
  lastTripDate!: string | null;

  @Field(() => Int)
  tripCount!: number;

  @Field(() => [MileageTripGraph])
  trips!: MileageTripGraph[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@InputType()
export class MileageClaimInputGraph {
  @Field()
  @IsString()
  @MaxLength(120)
  title!: string;

  @Field(() => MileageSettlement, { defaultValue: MileageSettlement.REIMBURSEMENT })
  @IsEnum(MileageSettlement)
  settlement!: MileageSettlement;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memberNote?: string | null;
}

@InputType()
export class MileageTripInputGraph {
  @Field(() => ID)
  @IsUUID()
  vehicleId!: string;

  @Field()
  @Matches(ISO_DATE)
  tripDate!: string;

  @Field()
  @IsString()
  @MaxLength(160)
  fromLabel!: string;

  @Field()
  @IsString()
  @MaxLength(160)
  toLabel!: string;

  @Field()
  @IsString()
  @MaxLength(200)
  purpose!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  distanceMeters!: number;

  @Field({ defaultValue: false })
  @IsBoolean()
  roundTrip!: boolean;
}

@ObjectType()
export class MileageRecurringFillGraph {
  @Field(() => MileageClaimGraph)
  claim!: MileageClaimGraph;

  @Field(() => Int, { description: 'Déplacements ajoutés.' })
  added!: number;
}

// ── Reçus fiscaux ───────────────────────────────────────────────────────

@ObjectType()
export class TaxReceiptSettingsGraph {
  @Field()
  taxReceiptEnabled!: boolean;

  @Field(() => TaxReceiptOrganismType, { nullable: true })
  taxReceiptOrganismType!: TaxReceiptOrganismType | null;

  @Field(() => String, { nullable: true })
  taxReceiptPurpose!: string | null;

  @Field(() => String, { nullable: true })
  rnaNumber!: string | null;

  @Field(() => String, { nullable: true })
  taxReceiptSignatoryName!: string | null;

  @Field(() => String, { nullable: true })
  taxReceiptSignatoryTitle!: string | null;
}

@InputType()
export class TaxReceiptSettingsInputGraph {
  @Field()
  @IsBoolean()
  taxReceiptEnabled!: boolean;

  @Field(() => TaxReceiptOrganismType, { nullable: true })
  @IsOptional()
  @IsEnum(TaxReceiptOrganismType)
  taxReceiptOrganismType?: TaxReceiptOrganismType | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  taxReceiptPurpose?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  rnaNumber?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxReceiptSignatoryName?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxReceiptSignatoryTitle?: string | null;
}

@ObjectType()
export class TaxReceiptPendingDonorGraph {
  @Field(() => ID)
  memberId!: string;

  @Field()
  memberName!: string;

  @Field(() => Int)
  claimCount!: number;

  @Field(() => Int)
  totalCents!: number;

  @Field()
  missingAddress!: boolean;
}

@ObjectType()
export class TaxReceiptGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field()
  memberName!: string;

  @Field(() => Int)
  year!: number;

  @Field()
  number!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => TaxReceiptStatus)
  status!: TaxReceiptStatus;

  @Field({ description: 'YYYY-MM-DD' })
  issuedOn!: string;

  @Field(() => String, { nullable: true })
  cancelReason!: string | null;
}

// ── Conversions ─────────────────────────────────────────────────────────

const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;

export function toVehicleGraph(v: {
  id: string;
  memberId: string;
  label: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
  archivedAt: Date | null;
  member: { firstName: string; lastName: string };
}): MileageVehicleGraph {
  return {
    id: v.id,
    memberId: v.memberId,
    memberName: fullName(v.member),
    label: v.label,
    kind: v.kind,
    fiscalHorsepower: v.fiscalHorsepower,
    isElectric: v.isElectric,
    archived: v.archivedAt !== null,
  };
}

export function toRecurringGraph(r: {
  id: string;
  memberId: string;
  vehicleId: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
  weekdays: number[];
  startsOn: Date;
  endsOn: Date | null;
  archivedAt: Date | null;
  vehicle: { label: string };
}): MileageRecurringTripGraph {
  return {
    id: r.id,
    memberId: r.memberId,
    vehicleId: r.vehicleId,
    vehicleLabel: r.vehicle.label,
    fromLabel: r.fromLabel,
    toLabel: r.toLabel,
    purpose: r.purpose,
    distanceMeters: r.distanceMeters,
    roundTrip: r.roundTrip,
    weekdays: r.weekdays,
    startsOn: formatIsoDate(r.startsOn),
    endsOn: r.endsOn ? formatIsoDate(r.endsOn) : null,
    archived: r.archivedAt !== null,
  };
}

export function toClaimGraph(c: ClaimView): MileageClaimGraph {
  const dates = c.trips.map((t) => formatIsoDate(t.tripDate)).sort();
  return {
    id: c.id,
    memberId: c.memberId,
    memberName: fullName(c.member),
    title: c.title,
    settlement: c.settlement,
    status: c.status,
    memberNote: c.memberNote,
    submittedAt: c.submittedAt,
    reviewedAt: c.reviewedAt,
    reviewComment: c.reviewComment,
    totalMeters: c.totalMeters,
    amountCents: c.displayCents,
    estimated: c.status !== MileageClaimStatus.APPROVED,
    provisional: c.provisional,
    reimbursed: c.reimbursed,
    entryId: c.entryId,
    taxReceiptId: c.taxReceiptId,
    taxReceiptNumber: c.taxReceipt?.number ?? null,
    firstTripDate: dates[0] ?? null,
    lastTripDate: dates[dates.length - 1] ?? null,
    tripCount: c.trips.length,
    trips: c.trips.map((t) => ({
      id: t.id,
      vehicleId: t.vehicleId,
      vehicleLabel: t.vehicle.label,
      tripDate: formatIsoDate(t.tripDate),
      fromLabel: t.fromLabel,
      toLabel: t.toLabel,
      purpose: t.purpose,
      distanceMeters: t.distanceMeters,
      roundTrip: t.roundTrip,
      totalMeters: t.distanceMeters * (t.roundTrip ? 2 : 1),
      recurringTripId: t.recurringTripId,
      amountCents: c.tripCents.get(t.id) ?? 0,
      scaleLabel: c.tripScaleLabels.get(t.id) ?? null,
    })),
    createdAt: c.createdAt,
  };
}

export function toTaxReceiptGraph(r: {
  id: string;
  memberId: string;
  year: number;
  number: string;
  amountCents: number;
  status: TaxReceiptStatus;
  issuedOn: Date;
  cancelReason: string | null;
  member: { firstName: string; lastName: string };
}): TaxReceiptGraph {
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: fullName(r.member),
    year: r.year,
    number: r.number,
    amountCents: r.amountCents,
    status: r.status,
    issuedOn: formatIsoDate(r.issuedOn),
    cancelReason: r.cancelReason,
  };
}

export function toPendingDonorGraph(d: PendingDonor): TaxReceiptPendingDonorGraph {
  return {
    memberId: d.memberId,
    memberName: fullName(d),
    claimCount: d.claimCount,
    totalCents: d.totalCents,
    missingAddress: d.missingAddress,
  };
}

export function toSettingsGraph(s: TaxReceiptSettings): TaxReceiptSettingsGraph {
  return { ...s };
}

export function vehicleInput(i: MileageVehicleInputGraph): VehicleInput {
  return {
    label: i.label,
    kind: i.kind,
    fiscalHorsepower: i.fiscalHorsepower ?? null,
    isElectric: i.isElectric,
  };
}

export function recurringInput(i: MileageRecurringTripInputGraph): RecurringTripInput {
  return {
    vehicleId: i.vehicleId,
    fromLabel: i.fromLabel,
    toLabel: i.toLabel,
    purpose: i.purpose,
    distanceMeters: i.distanceMeters,
    roundTrip: i.roundTrip,
    weekdays: i.weekdays,
    startsOn: parseIsoDate(i.startsOn),
    endsOn: i.endsOn ? parseIsoDate(i.endsOn) : null,
  };
}

export function claimInput(i: MileageClaimInputGraph): ClaimInput {
  return { title: i.title, settlement: i.settlement, memberNote: i.memberNote ?? null };
}

export function tripInput(i: MileageTripInputGraph): TripInput {
  return {
    vehicleId: i.vehicleId,
    tripDate: parseIsoDate(i.tripDate),
    fromLabel: i.fromLabel,
    toLabel: i.toLabel,
    purpose: i.purpose,
    distanceMeters: i.distanceMeters,
    roundTrip: i.roundTrip,
  };
}

export function settingsInput(i: TaxReceiptSettingsInputGraph): TaxReceiptSettings {
  return {
    taxReceiptEnabled: i.taxReceiptEnabled,
    taxReceiptOrganismType: i.taxReceiptOrganismType ?? null,
    taxReceiptPurpose: i.taxReceiptPurpose ?? null,
    rnaNumber: i.rnaNumber ?? null,
    taxReceiptSignatoryName: i.taxReceiptSignatoryName ?? null,
    taxReceiptSignatoryTitle: i.taxReceiptSignatoryTitle ?? null,
  };
}
