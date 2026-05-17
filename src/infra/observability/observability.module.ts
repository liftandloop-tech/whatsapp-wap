import { Module, Global } from '@nestjs/common';
import { TraceLogger } from './trace.logger';
import { RateLimiterService } from './rate-limiter.service';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

@Global()
@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
  ],
  providers: [TraceLogger, RateLimiterService],
  exports: [TraceLogger, RateLimiterService, BullBoardModule],
})
export class ObservabilityModule {}
