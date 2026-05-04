import { Module } from '@nestjs/common';
import { CaddyApiService } from './caddy.service';
import { DnsCheckService } from './dns-check.service';

/**
 * Services d'infrastructure transverses (Caddy admin API, DNS lookup, etc.).
 * Pas de dépendance Prisma ici — services purs réutilisables par les modules
 * métier (clubs, mail, etc.).
 */
@Module({
  providers: [CaddyApiService, DnsCheckService],
  exports: [CaddyApiService, DnsCheckService],
})
export class InfraModule {}
