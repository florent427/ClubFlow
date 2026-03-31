import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleOAuthController } from './oauth/google-oauth.controller';
import { GoogleOAuthService } from './oauth/google-oauth.service';

@Module({
  imports: [
    PrismaModule,
    FamiliesModule,
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-development',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [GoogleOAuthController],
  providers: [
    AuthService,
    AuthResolver,
    JwtStrategy,
    ClubContextGuard,
    EmailVerificationService,
    GoogleOAuthService,
    GqlThrottlerGuard,
  ],
  exports: [AuthService, EmailVerificationService],
})
export class AuthModule {}
