import { BadRequestException } from '@nestjs/common';
import { assertUtcQuarterHour } from './quarter-hour';

describe('assertUtcQuarterHour', () => {
  it('accepte 2026-04-04T09:00:00.000Z', () => {
    expect(() =>
      assertUtcQuarterHour('Début', new Date('2026-04-04T09:00:00.000Z')),
    ).not.toThrow();
  });

  it('rejette les minutes non multiples de 15 (UTC)', () => {
    expect(() =>
      assertUtcQuarterHour('Début', new Date('2026-04-04T09:07:00.000Z')),
    ).toThrow(BadRequestException);
  });
});
