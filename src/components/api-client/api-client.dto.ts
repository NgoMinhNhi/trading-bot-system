// src/components/api-client/dto/api-request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class ApiRequestDto {
  @ApiProperty({
    description: 'API endpoint path',
    example: 'users',
  })
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({
    description: 'Query parameters',
    example: { limit: 10, page: 1 },
    required: false,
  })
  @IsOptional()
  params?: Record<string, any>;
}
