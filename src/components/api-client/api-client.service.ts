// src/components/api-client/api-client.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '../../common/http/http-client.service';

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);
  private baseUrl: string | undefined;
  constructor(
    private readonly httpClientService: HttpClientService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('MT5_AGENT_URL');
  }

  async fetchData(endpoint: string, params?: any) {
    try {
      switch (endpoint) {
        case 'account':
          return await this.getAccount(
            params.login,
            params.password,
            params.server,
          );
        case 'orders':
          return await this.getOrders(
            params.login,
            params.password,
            params.server,
          );
        case 'all':
          return await this.getAllData(
            params.login,
            params.password,
            params.server,
          );
        default:
          this.logger.error(`Invalid endpoint: ${endpoint}`);
          throw `Invalid endpoint: ${endpoint}`;
      }
    } catch (error) {
      this.logger.error(`API request failed: ${error.message}`, error.stack);
      throw `API request failed: ${error.message}`;
    }
  }

  async getAccount(
    login: string,
    password: string,
    server: string,
  ): Promise<any> {
    return this.httpClientService.post(`${this.baseUrl}/mt5/account`, {
      login,
      password,
      server,
    });
  }
  async getOrders(
    login: string,
    password: string,
    server: string,
  ): Promise<any> {
    return this.httpClientService.post(`${this.baseUrl}/mt5/orders`, {
      login,
      password,
      server,
    });
  }

  async getAllData(
    login: string,
    password: string,
    server: string,
  ): Promise<any> {
    return this.httpClientService.post(`${this.baseUrl}/mt5/all`, {
      login,
      password,
      server,
    });
  }
}
