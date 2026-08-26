import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates and transforms a request payload against a contracts Zod schema.
 * Use this instead of a class-validator DTO for anything shaped by a schema
 * in @coach/contracts. See shared.md, "Using it in NestJS":
 *
 *   @Post()
 *   create(@Body(new ZodValidationPipe(CreateInterviewInputSchema)) input: CreateInterviewInput) {}
 *
 * Keep the global ValidationPipe (main.ts) for anything the Zod pipe does
 * not cover; Zod schemas are the rule, class DTOs are the exception.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationFailed',
        message: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      });
    }
    return result.data;
  }
}
