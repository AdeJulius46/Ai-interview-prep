import { Controller, Get, Query } from '@nestjs/common';
import type { HistoryPageDto, ProgressDto } from '@coach/contracts';
import { ProgressService } from './progress.service';

@Controller()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('interviews')
  getHistory(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<HistoryPageDto> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.progressService.getHistory(
      parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor,
    );
  }

  @Get('progress')
  getProgress(): Promise<ProgressDto> {
    return this.progressService.getProgress();
  }
}
