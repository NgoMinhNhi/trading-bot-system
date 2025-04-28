// src/components/api-client/dto/api-request.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class ApiRequestDto {
  @ApiProperty({
    description: 'API endpoint path',
    example: 'account',
  })
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({
    description: 'Query parameters',
    example: {
      login: 1,
      password: 'password',
      server: 'server',
    },
    required: false,
  })
  @IsOptional()
  params: {
    login: string;
    password: string;
    server: string;
  };
}
