import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesystemStorageAdapter } from './filesystem-storage.adapter';
import { MediaAssetsService } from './media-assets.service';
import { MediaController } from './media.controller';
import { MEDIA_STORAGE } from './media-storage.interface';

@Module({
  imports: [
    PrismaModule,
    // Le GET /media/:id vérifie le JWT à la main plutôt que par un guard :
    // la route doit rester ouverte aux `<img src>` anonymes de la vitrine,
    // et n'exiger une preuve que pour les fichiers privés. Même secret que
    // AuthModule — un secret divergent ferait échouer toutes les
    // vérifications en silence, donc renverrait 404 sur les fichiers privés.
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-development',
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaAssetsService,
    {
      provide: MEDIA_STORAGE,
      // Phase 1 : disque local. Phase 2 : swap à S3StorageAdapter via env
      // `MEDIA_STORAGE_KIND=s3` par exemple (factory switch à ajouter).
      useClass: FilesystemStorageAdapter,
    },
  ],
  exports: [MediaAssetsService],
})
export class MediaModule {}
