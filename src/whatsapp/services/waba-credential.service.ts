import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Agent } from 'https';
import {
  WabaAccount,
  WabaAccountDocument,
} from '../onboarding/schemas/waba-account.schema';

@Injectable()
export class WabaCredentialService {
  private readonly logger = new Logger(WabaCredentialService.name);

  private readonly httpsAgent = new Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    maxSockets: 100,
  });

  // IMPORTANT: do NOT include /whatsapp here
  private readonly baseUrl =
    process.env.BACKEND_INTERNAL_URL ||
    'http://localhost:3300/api/internal/whatsapp';

  constructor(
    @InjectModel(WabaAccount.name)
    private readonly wabaAccountModel: Model<WabaAccountDocument>,
  ) {}

  async getCredentials(clientId: number) {
    try {
      // 1. 🛡️ Try Local Identity Vault (MongoDB) First
      const localAccount = await this.wabaAccountModel
        .findOne({
          clientId: String(clientId),
          status: { $ne: 'DELETED' },
        })
        .sort({ createdAt: -1 });

      const url = `${this.baseUrl}/credentials/${clientId}`;
      this.logger.log(`[VAULT_FETCH] ${url}`);

      // 2. 🏛️ Fetch Management State (PostgreSQL via Backend)
      const res = await axios.get(url, {
        httpsAgent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret':
            process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
        },
      });

      const backendCreds = res.data.data || res.data;

      // 3. 🧩 Combine: Management State + Local Token
      // If backend says VAULTED, we MUST have it locally.
      let token = backendCreds.accessToken;
      if (token === 'VAULTED' || !token) {
        if (!localAccount) {
          throw new Error(
            `Token is vaulted but no local account found for client ${clientId}`,
          );
        }
        token = localAccount.accessToken;
      }

      return {
        ...backendCreds,
        accessToken: token,
        // Ensure we use the IDs from whoever is most up to date, usually local is better for Engine
        wabaId: localAccount?.wabaId || backendCreds.wabaId,
        phoneNumberId:
          localAccount?.phoneNumberId || backendCreds.phoneNumberId,
      };
    } catch (err: any) {
      this.logger.error(
        `[VAULT_FAILURE] Client=${clientId}`,
        err?.response?.data || err.message,
      );

      throw new Error(
        `Failed to resolve WABA credentials for client ${clientId}`,
      );
    }
  }

  async reportAuthFailure(clientId: number) {
    try {
      const url = `${this.baseUrl}/credentials/${clientId}/auth-failure`;

      await axios.post(
        url,
        {},
        {
          httpsAgent: this.httpsAgent,
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret':
              process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
          },
        },
      );

      this.logger.warn(`[AUTH_FAILURE_REPORTED] client=${clientId}`);
    } catch (err: any) {
      this.logger.error(
        `[AUTH_FAILURE_REPORT_ERROR] client=${clientId}`,
        err?.response?.data || err.message,
      );
    }
  }

  async getConnectedClients() {
    try {
      const url = `${this.baseUrl}/connected-clients`;
      const res = await axios.get(url, {
        httpsAgent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret':
            process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
        },
      });
      return res.data.clientIds || [];
    } catch (err: any) {
      this.logger.error(`[CLIENT_LIST_FAILURE]`, err.message);
      return [];
    }
  }
  async getClientByWabaId(wabaId: string): Promise<number | null> {
    const account = await this.wabaAccountModel.findOne({ wabaId });
    return account ? Number(account.clientId) : null;
  }

  /**
   * BUG-4 FIX: Resolve clientId from the Meta-provided phoneNumberId.
   *
   * Meta always includes `value.metadata.phone_number_id` in inbound message
   * webhooks — this is the WABA-registered number that received the message.
   * Using this instead of "last outbound message to sender" gives us
   * deterministic, multi-tenant-safe routing.
   *
   * Returns null if the phoneNumberId hasn't been onboarded yet — callers
   * must log + skip, NOT fall back to the last-sent heuristic.
   */
  async getClientByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<number | null> {
    const account = await this.wabaAccountModel.findOne({ phoneNumberId });
    return account ? Number(account.clientId) : null;
  }
}
