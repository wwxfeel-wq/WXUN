import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './common/config/env.validation';

// H-043: 启动前验证必需的环境变量
validateEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Parse CORS origins — 不再自动将 HTTPS 降级为 HTTP
  const corsOriginList = corsOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  // Security: Helmet middleware
  // CSP 由 Nginx 处理，此处禁用以避免重复 header 冲突
  // HSTS 仅在配置了 HTTPS origin 的生产环境中启用
  app.use(
    helmet({
      contentSecurityPolicy: false, // 由 Nginx 处理 CSP
      hsts: isProduction && corsOriginList.some((o) => o.startsWith('https://')),
    }),
  );

  // M-040: Request ID tracing
  app.use((req: any, _res: any, next: any) => {
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = randomUUID();
    }
    next();
  });

  // Enable CORS
  app.enableCors({
    origin: corsOriginList,
    credentials: true,
    exposedHeaders: ['Content-Type', 'X-Accel-Buffering'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  });

  // Request logging middleware
  const httpLogger = new Logger('HttpRequest');
  app.use((req: any, res: any, next: any) => {
    res.on('finish', () => {
      httpLogger.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
    });
    next();
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger documentation (disabled in production)
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EchoLife API')
      .setDescription('AI Digital Life OS - API Documentation')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  process.on('SIGTERM', () => {
    Logger.log('Received SIGTERM, shutting down gracefully', 'Bootstrap');
    app.close();
  });

  await app.listen(port);
  Logger.log(`EchoLife API is running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Environment: ${isProduction ? 'production' : 'development'}`, 'Bootstrap');
  if (!isProduction) {
    Logger.log(`Swagger docs available at http://localhost:${port}/api/docs`, 'Bootstrap');
  }
}

bootstrap();
