import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { FeedbackDto } from '@coach/contracts';
import { FeedbackService } from './feedback.service';

@Controller('interviews')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post(':id/feedback')
  @HttpCode(201)
  generate(@Param('id') id: string): Promise<FeedbackDto> {
    return this.feedbackService.generate(id);
  }
}
