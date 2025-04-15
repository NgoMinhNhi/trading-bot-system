// src/components/api-client/api-client.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '../../common/http/http-client.service';

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);

  constructor(
    private readonly httpClientService: HttpClientService,
    private readonly configService: ConfigService,
  ) {}

  async fetchData(endpoint: string, params?: any) {
    try {
      const baseUrl = this.configService.get<string>('THIRD_PARTY_API_URL');
      const apiKey = this.configService.get<string>('THIRD_PARTY_API_KEY');

      return await this.httpClientService.get(`${baseUrl}/${endpoint}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        params,
      });
    } catch (error) {
      this.logger.error(`API request failed: ${error.message}`, error.stack);
      throw `API request failed: ${error.message}`;
    }
  }
}
