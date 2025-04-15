// src/components/api-client/api-client.module.ts
import { Module } from '@nestjs/common';
import { ApiClientService } from './api-client.service';
import { HttpClientModule } from '../../common/http/http-client.module';
import { ApiClientController } from './api-client.controller';

@Module({
  imports: [HttpClientModule],
  providers: [ApiClientService],
  controllers: [ApiClientController],
  exports: [ApiClientService],
})
export class ApiClientModule {}
