import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PersonaModule } from '../persona/persona.module';
import { AnamModule } from '../anam/anam.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [PrismaModule, PersonaModule, AnamModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, QuestionBankService],
  exports: [QuestionBankService],
})
export class InterviewsModule {}
