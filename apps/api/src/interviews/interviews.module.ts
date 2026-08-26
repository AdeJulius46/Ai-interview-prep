import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [PrismaModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, QuestionBankService],
  exports: [QuestionBankService],
})
export class InterviewsModule {}
