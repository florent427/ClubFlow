/**
 * Slugify côté client : duplique la logique de `ClubsService.slugify` en API.
 * Utilisé pour pré-remplir/proposer un slug à partir du nom du club.
 *
 * Garder en sync avec `apps/api/src/clubs/clubs.service.ts:slugify`.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
