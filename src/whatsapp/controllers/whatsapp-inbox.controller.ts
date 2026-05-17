import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboundMessage } from '../schemas/inbound-message.schema';

@Controller('whatsapp/inbox')
export class InboundController {
  constructor(
    @InjectModel(InboundMessage.name)
    private readonly inboundModel: Model<InboundMessage>,
  ) {}

  /**
   * GET /whatsapp/inbox/conversations?clientId=10
   */
  @Get('conversations')
  async getConversations(@Query('clientId') clientId: string) {
    const conversations = await this.inboundModel.aggregate([
      { $match: { clientId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$from',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0],
            },
          },
        },
      },
      { $sort: { 'lastMessage.timestamp': -1 } },
    ]);

    return { success: true, data: conversations };
  }

  /**
   * GET /whatsapp/inbox/messages?clientId=10&contactPhone=91999
   */
  @Get('messages')
  async getMessages(
    @Query('clientId') clientId: string,
    @Query('contactPhone') contactPhone: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    const messages = await this.inboundModel
      .find({
        clientId,
        $or: [{ from: contactPhone }, { to: contactPhone }],
      })
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return { success: true, data: messages.reverse() };
  }

  /**
   * GET /whatsapp/inbox/recent?clientId=10
   */
  @Get('recent')
  async getRecentMessages(@Query('clientId') clientId: string) {
    const messages = await this.inboundModel
      .find({ clientId })
      .sort({ timestamp: -1 })
      .limit(20);

    return { success: true, data: messages };
  }

  /**
   * POST /whatsapp/inbox/send
   */
  @Post('send')
  async sendMessage(@Body() body: any) {
    try {
      const message = await this.inboundModel.create({
        clientId: body.clientId,
        wamid: `local_${Date.now()}`,
        from: 'BUSINESS',
        to: body.to,
        body: body.text, // IMPORTANT
        type: 'text',
        status: 'SENT',
        timestamp: new Date(),
        rawPayload: {},
      });

      return {
        success: true,
        data: message,
      };
    } catch (error: any) {
      console.error('SEND ERROR', error);

      return {
        statusCode: 500,
        message: 'Internal server error',
        error: error.message,
      };
    }
  }
}
