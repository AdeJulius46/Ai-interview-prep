import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
// Side-effect import: throws at module-load time if the Prisma enums and
// the @coach/contracts enums have drifted. See shared.md, "Enum parity guard".
import './common/enum-parity';

@Module({
  imports: [AppConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
