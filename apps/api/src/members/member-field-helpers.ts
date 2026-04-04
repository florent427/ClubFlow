import { BadRequestException } from '@nestjs/common';
import type {
  Member,
  MemberCatalogFieldKey,
  MemberCustomFieldDefinition,
} from '@prisma/client';

const CATALOG_LABELS_FR: Record<MemberCatalogFieldKey, string> = {
  PHONE: 'Téléphone',
  ADDRESS_LINE: 'Adresse',
  POSTAL_CODE: 'Code postal',
  CITY: 'Ville',
  BIRTH_DATE: 'Date de naissance',
  PHOTO_URL: 'URL photo',
  MEDICAL_CERT_EXPIRES_AT: 'Expiration certificat médical',
  GRADE_LEVEL: 'Grade',
};

export function catalogFieldLabelFr(key: MemberCatalogFieldKey): string {
  return CATALOG_LABELS_FR[key] ?? key;
}

export function isCatalogFieldEmpty(
  key: MemberCatalogFieldKey,
  m: Member,
): boolean {
  switch (key) {
    case 'PHONE':
      return !m.phone?.trim();
    case 'ADDRESS_LINE':
      return !m.addressLine?.trim();
    case 'POSTAL_CODE':
      return !m.postalCode?.trim();
    case 'CITY':
      return !m.city?.trim();
    case 'BIRTH_DATE':
      return m.birthDate == null;
    case 'PHOTO_URL':
      return !m.photoUrl?.trim();
    case 'MEDICAL_CERT_EXPIRES_AT':
      return m.medicalCertExpiresAt == null;
    case 'GRADE_LEVEL':
      return m.gradeLevelId == null || m.gradeLevelId === '';
    default:
      return true;
  }
}

export function normalizeCustomFieldValue(
  def: Pick<
    MemberCustomFieldDefinition,
    'type' | 'optionsJson' | 'label'
  >,
  raw: string | null | undefined,
): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const s = String(raw).trim();
  switch (def.type) {
    case 'TEXT':
      return s.slice(0, 500);
    case 'TEXT_LONG':
      return s.slice(0, 10000);
    case 'NUMBER':
      if (!/^-?\d+(\.\d+)?$/.test(s)) {
        throw new BadRequestException(
          `Valeur numérique invalide pour « ${def.label} »`,
        );
      }
      return s;
    case 'DATE': {
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
        throw new BadRequestException(
          `Date invalide (AAAA-MM-JJ) pour « ${def.label} »`,
        );
      }
      return s.slice(0, 10);
    }
    case 'BOOLEAN': {
      const low = s.toLowerCase();
      if (low !== 'true' && low !== 'false') {
        throw new BadRequestException(
          `Booléen attendu (true/false) pour « ${def.label} »`,
        );
      }
      return low === 'true' ? 'true' : 'false';
    }
    case 'SELECT': {
      if (!def.optionsJson) {
        throw new BadRequestException(
          `Options manquantes pour le champ « ${def.label} »`,
        );
      }
      let opts: string[];
      try {
        opts = JSON.parse(def.optionsJson) as string[];
      } catch {
        throw new BadRequestException(`Configuration SELECT invalide`);
      }
      if (!Array.isArray(opts) || !opts.includes(s)) {
        throw new BadRequestException(
          `Valeur non prévue pour « ${def.label} »`,
        );
      }
      return s;
    }
    default:
      return s;
  }
}
