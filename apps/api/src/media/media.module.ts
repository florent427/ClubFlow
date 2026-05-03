import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesystemStorageAdapter } from './filesystem-storage.adapter';
import { MediaAssetsService } from './media-assets.service';
import { MediaController } from './media.controller';
import { MEDIA_STORAGE } from './media-storage.interface';

@Module({
  imports: [PrismaModule],
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
