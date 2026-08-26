import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  AppendMessagesInputSchema,
  type AppendMessagesInput,
  type AppendMessagesResult,
  type InterviewDto,
} from '@coach/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TranscriptService } from './transcript.service';

@Controller('interviews')
export class TranscriptController {
  constructor(private readonly transcriptService: TranscriptService) {}

  @Post(':id/messages')
  @HttpCode(200)
  appendMessages(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AppendMessagesInputSchema)) input: AppendMessagesInput,
  ): Promise<AppendMessagesResult> {
    return this.transcriptService.appendMessages(id, input.messages);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string): Promise<InterviewDto> {
    return this.transcriptService.complete(id);
  }
}
