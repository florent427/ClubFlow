import { describe, expect, it } from 'vitest';
import {
  canResendVerification,
  isUnverifiedEmailError,
} from './email-verification';

describe('isUnverifiedEmailError', () => {
  it('reconnaît le refus de l’API, apostrophe typographique comprise', () => {
    expect(
      isUnverifiedEmailError(
        'Votre adresse e-mail n’est pas encore vérifiée. Vérifiez votre boîte mail ou demandez un nouveau lien.',
      ),
    ).toBe(true);
  });

  it('reconnaît la même phrase sans accent ni apostrophe courbe', () => {
    expect(
      isUnverifiedEmailError("Votre adresse e-mail n'est pas encore verifiee."),
    ).toBe(true);
  });

  it('ne se déclenche pas sur les autres refus', () => {
    expect(isUnverifiedEmailError('Identifiants invalides.')).toBe(false);
    expect(isUnverifiedEmailError('')).toBe(false);
    expect(isUnverifiedEmailError(null)).toBe(false);
  });
});

describe('canResendVerification', () => {
  it('accepte une adresse plausible', () => {
    expect(canResendVerification(' parent@example.re ')).toBe(true);
  });

  it('refuse ce qui n’est pas une adresse', () => {
    expect(canResendVerification('')).toBe(false);
    expect(canResendVerification('parent')).toBe(false);
    expect(canResendVerification('parent@example')).toBe(false);
  });
});
