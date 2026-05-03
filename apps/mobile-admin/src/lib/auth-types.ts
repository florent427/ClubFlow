/**
 * Shape réelle de `ViewerProfileGraph` côté API
 * (apps/api/src/families/models/viewer-profile.model.ts).
 */
export type LoginProfile = {
  memberId: string | null;
  contactId: string | null;
  clubId: string;
  firstName: string;
  lastName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
  householdGroupId: string | null;
};

export type LoginResponse = {
  accessToken: string;
  viewerProfiles: LoginProfile[];
  contactClubId?: string | null;
};

export function profileDisplayName(p: LoginProfile): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Profil';
}
