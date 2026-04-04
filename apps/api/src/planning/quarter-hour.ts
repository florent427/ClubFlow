import { BadRequestException } from '@nestjs/common';

/**
 * Rejette si l'instant n'est pas aligné sur une minute UTC ∈ {0,15,30,45}
 * avec secondes et millisecondes nulles.
 */
export function assertUtcQuarterHour(label: string, d: Date): void {
  if (
    d.getUTCMilliseconds() !== 0 ||
    d.getUTCSeconds() !== 0 ||
    d.getUTCMinutes() % 15 !== 0
  ) {
    throw new BadRequestException(
      `${label} : horaire invalide (pas d'un quart d'heure exact, UTC).`,
    );
  }
}
