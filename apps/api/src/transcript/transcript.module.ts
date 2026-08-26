import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnamModule } from '../anam/anam.module';
import { TranscriptController } from './transcript.controller';
import { TranscriptService } from './transcript.service';

@Module({
  imports: [PrismaModule, AnamModule],
  controllers: [TranscriptController],
  providers: [TranscriptService],
})
export class TranscriptModule {}
