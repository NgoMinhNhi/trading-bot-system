// src/components/api-client/api-client.module.ts
import { Module } from '@nestjs/common';
import { ApiClientService } from './api-client.service';
import { HttpClientModule } from '../../common/http/http-client.module';

@Module({
  imports: [HttpClientModule],
  providers: [ApiClientService],
  exports: [ApiClientService],
})
export class ApiClientModule {}
