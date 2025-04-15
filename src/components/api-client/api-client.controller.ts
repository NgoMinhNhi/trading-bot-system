// src/components/api-client/api-client.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiClientService } from './api-client.service';
import { ApiRequestDto } from './api-client.dto';

@ApiTags('External API')
@Controller('api-client')
export class ApiClientController {
  constructor(private readonly apiClientService: ApiClientService) {}

  @Post('fetch')
  @ApiOperation({ summary: 'Fetch data from third-party API' })
  @ApiResponse({
    status: 200,
    description: 'Data successfully retrieved',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters',
  })
  @ApiResponse({
    status: 500,
    description: 'Server error or third-party API error',
  })
  async fetchData(@Body() apiRequestDto: ApiRequestDto) {
    const { endpoint, params } = apiRequestDto;
    const result = await this.apiClientService.fetchData(endpoint, params);
    return {
      status: 'success',
      data: result,
    };
  }
}
