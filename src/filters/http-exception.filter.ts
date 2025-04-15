import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    let messages = {};
    const message = exception.message;
    const translatedMessage = messages[message] || message;
    response.status(status).json({
      statusCode: status || 500,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: translatedMessage || 'Internal server error',
    });
  }
}
