import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OnboardingController } from './onboarding.controller';
import { OnboardingServiceImpl } from './services/onboarding.service';
import { MetaApiServiceImpl } from './services/meta-api.service';
import { TokenManagerServiceImpl } from './services/token-manager.service';
import { OnboardingMaintenanceService } from './services/onboarding-maintenance.service';
import { WabaAccount, WabaAccountSchema } from './schemas/waba-account.schema';
import {
  OnboardingAuditLog,
  OnboardingAuditLogSchema,
} from './schemas/onboarding-audit-log.schema';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    SharedModule, // For REDIS_CLIENT
    MongooseModule.forFeature([
      { name: WabaAccount.name, schema: WabaAccountSchema },
      { name: OnboardingAuditLog.name, schema: OnboardingAuditLogSchema },
    ]),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingMaintenanceService,
    {
      provide: 'ONBOARDING_SERVICE',
      useClass: OnboardingServiceImpl,
    },
    {
      provide: 'META_API_SERVICE',
      useClass: MetaApiServiceImpl,
    },
    {
      provide: 'TOKEN_MANAGER',
      useClass: TokenManagerServiceImpl,
    },
  ],
  exports: [
    'ONBOARDING_SERVICE',
    'META_API_SERVICE',
    'TOKEN_MANAGER',
    MongooseModule,
  ],
})
export class OnboardingModule {}
