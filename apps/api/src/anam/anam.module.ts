import { Module } from '@nestjs/common';
import { AnamService } from './anam.service';

@Module({
  providers: [AnamService],
  exports: [AnamService],
})
export class AnamModule {}
