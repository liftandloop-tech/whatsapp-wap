import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { OnboardingService } from '../interfaces/onboarding.interface';
import { OnboardingState } from '../onboarding-state.enum';
import { OnboardingStateMachine } from '../onboarding-state.machine';
import {
  WabaAccount,
  WabaAccountDocument,
} from '../schemas/waba-account.schema';
import {
  OnboardingAuditLog,
  OnboardingAuditLogDocument,
} from '../schemas/onboarding-audit-log.schema';
import type { MetaApiService } from '../interfaces/meta-api.interface';
import type { TokenManager } from '../interfaces/token-manager.interface';
import { EmbeddedSignupDto } from '../dto/signup.dto';
import { AddPhoneDto } from '../dto/add-phone.dto';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { RegisterDto } from '../dto/register.dto';

@Injectable()
export class OnboardingServiceImpl implements OnboardingService {
  private readonly logger = new Logger(OnboardingServiceImpl.name);

  constructor(
    @InjectModel(WabaAccount.name)
    private readonly wabaAccountModel: Model<WabaAccountDocument>,

    @InjectModel(OnboardingAuditLog.name)
    private readonly auditLogModel: Model<OnboardingAuditLogDocument>,

    @Inject('META_API_SERVICE')
    private readonly metaApi: MetaApiService,

    @Inject('TOKEN_MANAGER')
    private readonly tokenManager: TokenManager,
  ) {}

  async startEmbeddedSignup(dto: EmbeddedSignupDto): Promise<void> {
    this.logger.log(`Starting Embedded Signup for client: ${dto.clientId}`);

    try {
      const tokenData = await this.metaApi.exchangeCodeForToken(dto.code);
      const details = await this.metaApi.getWabaDetails(tokenData.accessToken);

      const primaryPhone = details.phoneNumbers?.[0];

      const account = await this.wabaAccountModel.findOneAndUpdate(
        {
          clientId: dto.clientId,
          wabaId: details.wabaId,
        } as any,
        {
          businessId: details.businessId,
          accessToken: tokenData.accessToken,
          tokenExpiresAt: new Date(Date.now() + tokenData.expiresIn * 1000),
          status: primaryPhone
            ? OnboardingState.ATTACHED
            : OnboardingState.INIT,
          phoneNumberId: primaryPhone?.id,
          phoneNumber: primaryPhone?.display_phone_number,
        },
        {
          upsert: true,
          new: true,
          lean: false,
        },
      );

      this.logger.log(
        `[ONBOARDING] Successfully linked WABA ${details.wabaId} for Client ${dto.clientId}. Status: ${account.status}`,
      );

      await this.pushToTruthBridge({
        clientId: dto.clientId,
        wabaId: details.wabaId,
        phoneNumberId: primaryPhone?.id,
        phoneNumber: primaryPhone?.display_phone_number,
        status: account.status,
        triggeredBy: 'API',
      });
    } catch (error: any) {
      this.logger.error(`[ONBOARDING_FAILED] ${error.message}`);
      throw error;
    }
  }

  async addPhoneNumber(dto: AddPhoneDto): Promise<void> {
    const account = await this.getAccountOrThrow(dto.clientId, dto.wabaId);

    const nextState = OnboardingState.ATTACHED;
    OnboardingStateMachine.assertTransition(account.status, nextState);

    const result = await this.metaApi.addPhoneNumber({
      wabaId: dto.wabaId,
      phoneNumber: dto.phoneNumber,
    });

    await this.updateAccountState(account, nextState, 'API', {
      phoneNumberId: result.id,
      phoneNumber: dto.phoneNumber,
    });
  }

  async requestOtp(dto: RequestOtpDto): Promise<void> {
    const account = await this.wabaAccountModel.findOne({
      phoneNumberId: dto.phoneNumberId,
    });

    if (!account) throw new Error('Account not found');

    const nextState = OnboardingState.OTP_SENT;
    OnboardingStateMachine.assertTransition(account.status, nextState);

    await this.tokenManager.getOrSetIdempotentResponse(
      `request_otp:${dto.phoneNumberId}`,
      300,
      async () => {
        await this.metaApi.requestOtp({
          wabaId: account.wabaId,
          phoneNumberId: dto.phoneNumberId,
          method: dto.method,
        });
      },
    );

    await this.updateAccountState(account, nextState, 'API');
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<void> {
    const account = await this.wabaAccountModel.findOne({
      phoneNumberId: dto.phoneNumberId,
    });

    if (!account) throw new Error('Account not found');

    const nextState = OnboardingState.VERIFIED;
    OnboardingStateMachine.assertTransition(account.status, nextState);

    await this.tokenManager.getOrSetIdempotentResponse(
      `verify_otp:${dto.phoneNumberId}`,
      300,
      async () => {
        await this.metaApi.verifyOtp({
          wabaId: account.wabaId,
          phoneNumberId: dto.phoneNumberId,
          code: dto.code,
        });
      },
    );

    await this.updateAccountState(account, nextState, 'API');
  }

  async registerNumber(dto: RegisterDto): Promise<void> {
    const account = await this.wabaAccountModel.findOne({
      phoneNumberId: dto.phoneNumberId,
    });

    if (!account) throw new Error('Account not found');

    const nextState = OnboardingState.REGISTERED_PENDING;
    OnboardingStateMachine.assertTransition(account.status, nextState);

    await this.metaApi.registerNumber({
      wabaId: account.wabaId,
      phoneNumberId: dto.phoneNumberId,
      pin: dto.pin,
    });

    await this.updateAccountState(account, nextState, 'API');
  }

  async handleWebhookEvent(payload: any): Promise<void> {
    const phoneNumberId = payload.id;

    const account = await this.wabaAccountModel.findOne({ phoneNumberId });
    if (!account) return;

    const nextState = this.mapWebhookStatusToState(payload.status);
    if (!nextState) return;

    if (account.status === nextState) return;

    if (!OnboardingStateMachine.canTransition(account.status, nextState)) {
      this.logger.warn(
        `[WEBHOOK] Rejecting out-of-order regression: ${account.status} -> ${nextState}`,
      );
      return;
    }

    await this.updateAccountState(account, nextState, 'WEBHOOK', {
      rawMetaStatus: payload.status,
    });

    this.logger.log(
      `WABA Account ${account.phoneNumber} is now ${nextState} via Webhook.`,
    );
  }

  private async pushToTruthBridge(data: any): Promise<void> {
    const bridgeUrl = `${
      process.env.BACKEND_INTERNAL_URL ||
      'http://localhost:5000/api/internal/whatsapp'
    }/onboarding-sync`;

    const secret = process.env.INTERNAL_SYNC_SECRET || 'sync_987654321';

    try {
      await axios.post(bridgeUrl, data, {
        headers: { 'x-internal-secret': secret },
        timeout: 5000,
      });

      this.logger.debug(
        `[TRUTH_BRIDGE] Successfully synced ${data.wabaId} state: ${data.status}`,
      );
    } catch (error: any) {
      this.logger.error(
        `[TRUTH_BRIDGE] Error syncing to ${bridgeUrl}: ${error.message}`,
      );
    }
  }

  private mapWebhookStatusToState(status: string): OnboardingState | null {
    switch (status) {
      case 'CONNECTED':
      case 'VERIFIED':
        return OnboardingState.LIVE;

      case 'DISCONNECTED':
      case 'FLAGGED':
        return OnboardingState.FAILED_TEMP;

      case 'DELETED':
        return OnboardingState.FAILED_PERMANENT;

      default:
        return null;
    }
  }

  private async getAccountOrThrow(
    clientId: string,
    wabaId: string,
  ): Promise<WabaAccountDocument> {
    const account = await this.wabaAccountModel.findOne({
      clientId,
      wabaId,
    });

    if (!account) throw new Error('WabaAccount not found');

    return account;
  }

  private async updateAccountState(
    account: WabaAccountDocument,
    nextState: OnboardingState,
    triggeredBy: 'API' | 'WEBHOOK' | 'SYSTEM' = 'API',
    updates: Partial<WabaAccount> = {},
  ): Promise<void> {
    const fromState = account.status;

    const result = (await this.wabaAccountModel.findOneAndUpdate(
      { _id: account._id, __v: account.__v },
      {
        ...updates,
        status: nextState,
        $inc: { __v: 1 },
      },
      { new: true, lean: false },
    )) as WabaAccountDocument;

    if (!result) {
      throw new Error(
        `CONCURRENCY_ERROR: Account update failed for ${account._id}`,
      );
    }

    try {
      await this.auditLogModel.create({
        wabaId: account.wabaId,
        fromState,
        toState: nextState,
        triggeredBy,
        triggeredAt: new Date(),
        metadata: JSON.stringify(updates),
      });
    } catch (e: any) {
      this.logger.error(`[AUDIT] Failed to log transition: ${e.message}`);
    }

    setImmediate(async () => {
      try {
        await this.pushToTruthBridge({
          clientId: result.clientId,
          wabaId: result.wabaId,
          phoneNumberId: result.phoneNumberId,
          phoneNumber: result.phoneNumber,
          status: nextState,
          triggeredBy,
        });
      } catch (err: any) {
        this.logger.error(
          `[TRUTH_BRIDGE] Sync failed for ${result.wabaId}: ${err.message}`,
        );
      }
    });
  }
}
