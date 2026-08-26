import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CreateInterviewInputSchema, type CreateInterviewInput, type InterviewDto } from '@coach/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateInterviewInputSchema)) input: CreateInterviewInput,
  ): Promise<InterviewDto> {
    return this.interviewsService.create(input);
  }
}
