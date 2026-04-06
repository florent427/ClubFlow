import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useWebSocketAdapter(new IoAdapter(app));
  /** Origines admin (prod) ; en dev, localhost/127.0.0.1 avec port quelconque sont aussi autorisés (ex. portail membre :5174). */
  const adminOrigins = (process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';
  const allowNoOrigin =
    process.env.CORS_ALLOW_NO_ORIGIN === 'true' || !isProd;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        if (allowNoOrigin) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      }
      const localhostOk =
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin);
      const allowed = adminOrigins.includes(origin) || (!isProd && localhostOk);
      return callback(null, allowed);
    },
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
