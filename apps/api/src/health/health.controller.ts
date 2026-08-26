import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ db: 'up' }> {
    // A real query against Postgres, not a canned response, so a broken
    // DATABASE_URL or a down database surfaces here rather than silently
    // reporting healthy.
    await this.prisma.$queryRaw`SELECT 1`;
    return { db: 'up' };
  }
}
