import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

// `ignoreEnvFile: true` is deliberate: this module never reads a .env file
// itself. In production, main.ts loads `.env` via `dotenv/config` before
// Nest boots. In tests, each spec file loads the right .env.* fixture (or
// mutates process.env directly) before importing AppModule. That keeps env
// loading fully controlled by the entrypoint, so a boot-time env failure is
// deterministic and testable rather than dependent on cwd or file discovery.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
