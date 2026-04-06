import { describe, expect, it } from 'vitest';
import type { ModuleCodeStr } from './module-catalog';
import { modulesRequiredForPath, pathAllowed } from './club-modules-nav';

describe('modulesRequiredForPath', () => {
  it('planning', () => {
    expect(modulesRequiredForPath('/planning')).toEqual(['PLANNING']);
  });
  it('families needs MEMBERS and FAMILIES', () => {
    expect(modulesRequiredForPath('/members/families')).toEqual([
      'MEMBERS',
      'FAMILIES',
    ]);
  });
});

describe('pathAllowed', () => {
  it('denies planning when PLANNING off', () => {
    const isEnabled = (c: ModuleCodeStr) => c !== 'PLANNING';
    expect(pathAllowed('/planning', isEnabled)).toBe(false);
  });
  it('allows dashboard always', () => {
    expect(pathAllowed('/', () => false)).toBe(true);
  });
});
