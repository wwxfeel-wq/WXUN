import { Global, Module } from '@nestjs/common';
import { EncryptionUtil } from './utils/encryption.util';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [EncryptionUtil],
  exports: [EncryptionUtil],
})
export class CommonModule {}
