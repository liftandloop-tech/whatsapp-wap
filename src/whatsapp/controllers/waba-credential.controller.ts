import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WabaAccount,
  WabaAccountDocument,
} from '../onboarding/schemas/waba-account.schema';

@Controller('internal/whatsapp')
export class WabaAccountController {
  constructor(
    @InjectModel(WabaAccount.name)
    private readonly wabaAccountModel: Model<WabaAccountDocument>,
  ) {}

  /**
   * 🔐 INTERNAL: GET CREDENTIALS BY CLIENT ID
   */
  @Get('/credentials/:clientId')
  async getCredentials(@Param('clientId') clientId: string) {
    const account = await this.wabaAccountModel.findOne({ clientId });

    if (!account) {
      return {
        success: false,
        error: 'WABA account not found',
      };
    }

    return {
      success: true,
      data: {
        wabaId: account.wabaId,
        phoneNumberId: account.phoneNumberId,
        phoneNumber: account.phoneNumber,
        accessToken: account.accessToken,
        status: account.status,
        qualityRating: account.metadata?.qualityRating || 'GREEN',
      },
    };
  }

  /**
   * 🔍 GET ALL WABA ACCOUNTS
   */
  @Get()
  async findAll() {
    const accounts = await this.wabaAccountModel.find();
    return {
      success: true,
      data: accounts,
    };
  }

  /**
   * 🔍 GET BY CLIENT ID
   */
  @Get('/client/:clientId')
  async findByClient(@Param('clientId') clientId: string) {
    const accounts = await this.wabaAccountModel.find({ clientId });

    return {
      success: true,
      data: accounts,
    };
  }

  /**
   * 🔍 GET BY WABA ID
   */
  @Get('/waba/:wabaId')
  async findOne(@Param('wabaId') wabaId: string) {
    const account = await this.wabaAccountModel.findOne({ wabaId });

    return {
      success: true,
      data: account,
    };
  }

  /**
   * ✏️ UPDATE ACCOUNT
   */
  @Patch('/:id')
  async update(@Param('id') id: string, @Body() body: Partial<WabaAccount>) {
    const updated = await this.wabaAccountModel.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true },
    );

    return {
      success: true,
      message: 'WABA Account updated successfully',
      data: updated,
    };
  }

  /**
   * ❌ DELETE ACCOUNT
   */
  @Delete('/:id')
  async remove(@Param('id') id: string) {
    await this.wabaAccountModel.findByIdAndDelete(id);

    return {
      success: true,
      message: 'WABA Account deleted successfully',
    };
  }
}
