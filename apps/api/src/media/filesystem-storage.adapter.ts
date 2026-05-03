import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { Readable } from 'stream';
import type { MediaStorageAdapter } from './media-storage.interface';

/**
 * Adapter disque local (Phase 1). La racine est configurable via
 * `UPLOADS_DIR` (défaut `./uploads`).
 *
 * Ne sert pas les fichiers en HTTP direct — la route `GET /media/:id` lit
 * le fichier à travers `getObjectStream` et l'envoie au client avec les
 * bons headers.
 */
@Injectable()
export class FilesystemStorageAdapter implements MediaStorageAdapter {
  private get root(): string {
    const env = process.env.UPLOADS_DIR?.trim();
    return resolve(env && env.length > 0 ? env : './uploads');
  }

  private abs(key: string): string {
    return join(this.root, key);
  }

  async putObject(
    key: string,
    buffer: Buffer,
    _mimeType: string,
  ): Promise<void> {
    const abs = this.abs(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buffer);
  }

  async getObjectStream(key: string): Promise<Readable | null> {
    const abs = this.abs(key);
    if (!existsSync(abs)) return null;
    return createReadStream(abs);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.abs(key));
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await unlink(this.abs(key));
    } catch {
      /* silence : idempotent */
    }
  }

  publicUrl(_key: string): string | null {
    // Pour le FS local, on sert via l'API (`/media/:id`) ; rien de direct.
    return null;
  }
}
