import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    return next.handle().pipe(
      tap((ob) => {
        Logger.log(
          `🌠 Request... ${ob?.req?.originalUrl} completed after... ${
            Date.now() - now
          }ms ${
            ob.req?.auth?.email || ob.req?.auth?.phone
              ? `by ${ob.req?.auth?.email || ob.req?.auth?.phone}`
              : ''
          }`,
        );
      }),
    );
  }
}
