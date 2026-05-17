import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with slug ${slug} not found`);
    }
    return tenant;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }
  async findByPhoneNumberId(phoneNumberId: string) {
    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { phoneNumberId },
      include: {
        wabaAccount: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!phoneNumber) {
      return null;
    }

    return {
      tenant: phoneNumber.wabaAccount.tenant,
      phoneNumber,
    };
  }
}
