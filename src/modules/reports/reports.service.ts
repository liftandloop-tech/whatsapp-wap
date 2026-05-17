import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves a clientId (Int) or tenantId (CUID) to the actual Tenant CUID.
   */
  async resolveTenantId(idOrClientId: string): Promise<string> {
    // 1. Check if it's already a valid Tenant ID
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: idOrClientId },
      select: { id: true, name: true },
    });
    if (tenant) return tenant.id;

    // 2. Try to resolve via clientId (Legacy Bridge)
    const clientId = parseInt(idOrClientId, 10);
    if (!isNaN(clientId)) {
      const creds = await this.prisma.waba_credentials.findUnique({
        where: { clientId },
      });

      if (creds?.wabaId) {
        // Find or Create WabaAccount for this legacy cred
        let wabaAccount = await this.prisma.wabaAccount.findUnique({
          where: { wabaId: creds.wabaId },
          select: { id: true, tenantId: true },
        });

        if (!wabaAccount) {
          console.log(`[LegacyBridge] Provisioning new Tenant/WabaAccount for Client ${clientId}`);
          // Auto-create a Tenant for this legacy client
          const newTenant = await this.prisma.tenant.create({
            data: {
              name: creds.displayName || `Client ${clientId}`,
              slug: (creds.displayName || `client-${clientId}`).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            },
          });

          wabaAccount = await this.prisma.wabaAccount.create({
            data: {
              tenantId: newTenant.id,
              wabaId: creds.wabaId,
              businessName: creds.displayName || `Client ${clientId}`,
              accessToken: "LEGACY_CREDENTIALS_LINKED", // Marker
              tokenStatus: 'ACTIVE',
            },
          });
        }

        // ALWAYS ensure the PhoneNumber is registered and updated in the new system
        if (creds.phoneNumberId) {
           await this.prisma.phoneNumber.upsert({
             where: { phoneNumberId: creds.phoneNumberId },
             update: { 
               wabaAccountId: wabaAccount.id, // Use the WabaAccount ID
               displayNumber: creds.phoneNumber || "",
               verifiedName: creds.displayName || "",
               updatedAt: new Date()
             },
             create: {
               id: `br_${creds.phoneNumberId}`,
               wabaAccountId: wabaAccount.id,
               phoneNumberId: creds.phoneNumberId,
               displayNumber: creds.phoneNumber || "",
               verifiedName: creds.displayName || "",
             }
           }).catch(e => console.warn(`[LegacyBridge] Phone Provisioning skipped: ${e.message}`));
        }
        
        return wabaAccount.tenantId;
      }
    }

    return idOrClientId;
  }

  async getDashboardStats(idOrClientId: string) {
    try {
      const tenantId = await this.resolveTenantId(idOrClientId);

      const [sentCount, deliveredCount, readCount, failedCount] = await Promise.all([
        this.prisma.messageStatusEvent.count({
          where: { status: 'SENT', message: { tenantId } },
        }),
        this.prisma.messageStatusEvent.count({
          where: { status: 'DELIVERED', message: { tenantId } },
        }),
        this.prisma.messageStatusEvent.count({
          where: { status: 'READ', message: { tenantId } },
        }),
        this.prisma.messageStatusEvent.count({
          where: { status: 'FAILED', message: { tenantId } },
        }),
      ]);

      return {
        success: true,
        data: {
          totalSent: sentCount,
          delivered: deliveredCount,
          read: readCount,
          failed: failedCount,
          isWabaConnected: true, // Legacy bridge implies connectivity via waba_credentials
        },
      };
    } catch (error) {
      console.error(`[ReportsService] Dashboard Stats Error: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate dashboard stats');
    }
  }

  async getPerformanceStats(idOrClientId: string) {
    try {
      const tenantId = await this.resolveTenantId(idOrClientId);

      const stats = await this.prisma.messageStatusEvent.groupBy({
        by: ['status'],
        where: { message: { tenantId } },
        _count: true,
      });

      return {
        success: true,
        data: stats.map(s => ({
          status: s.status,
          count: s._count,
        })),
      };
    } catch (error) {
      console.error(`[ReportsService] Performance Stats Error: ${error.message}`);
      throw new InternalServerErrorException('Failed to generate performance stats');
    }
  }

  async getClientPhones(idOrClientId: string) {
    try {
      const tenantId = await this.resolveTenantId(idOrClientId);

      const wabaAccount = await this.prisma.wabaAccount.findFirst({
        where: { tenantId },
        include: { phoneNumbers: true },
      });

      if (!wabaAccount) return { success: true, data: [] };

      return {
        success: true,
        data: wabaAccount.phoneNumbers.map(p => ({
          id: p.id,
          display_phone_number: p.displayNumber,
          phone_number: p.displayNumber,
          status: 'CONNECTED',
          qualityRating: 'GREEN',
        })),
      };
    } catch (error) {
      console.error(`[ReportsService] Client Phones Error: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch client phones');
    }
  }
}
