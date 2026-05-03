/**
 * Chiffrement symétrique AES-256-GCM pour les secrets stockés en base
 * (clés API tierces, jetons, etc).
 *
 * - Clé dérivée via SHA-256 depuis `process.env.AI_SECRETS_KEY`.
 * - Format de sortie : base64(iv:12 + authTag:16 + ciphertext).
 * - Panic si la variable d'env est absente (jamais en clair).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.AI_SECRETS_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'AI_SECRETS_KEY manquant ou trop court (16 caractères minimum). ' +
        "Ajouter une entrée dans .env : AI_SECRETS_KEY=<chaîne aléatoire longue>",
    );
  }
  cachedKey = createHash('sha256').update(raw).digest(); // 32 bytes
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error('plaintext requis');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Payload chiffré invalide');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/**
 * Renvoie la clé masquée pour affichage UI (jamais la clé complète).
 * Ex. "sk-or-...a4b9c"
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 10) return '***';
  return `${plaintext.slice(0, 6)}…${plaintext.slice(-4)}`;
}
