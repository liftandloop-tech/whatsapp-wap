import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { WhatsappFlowsService } from '../services/whatsapp-flows.service';

@Controller('whatsapp/flows')
export class FlowsController {
  constructor(private readonly flowsService: WhatsappFlowsService) {}

  @Get()
  async listFlows(@Query('clientId') clientId: string) {
    return this.flowsService.listFlows(Number(clientId));
  }

  @Post('create')
  async createFlow(
    @Query('clientId') clientId: string,
    @Body() payload: { name: string; categories: string[] },
  ) {
    return this.flowsService.createFlow(
      Number(clientId),
      payload.name,
      payload.categories,
    );
  }
  @Get(':flowId')
  async getFlowDetails(
    @Query('clientId') clientId: string,
    @Param('flowId') flowId: string,
  ) {
    return this.flowsService.getFlowDetails(Number(clientId), flowId);
  }

  @Delete(':flowId')
  async deleteFlow(
    @Query('clientId') clientId: string,
    @Param('flowId') flowId: string,
  ) {
    return this.flowsService.deleteFlow(Number(clientId), flowId);
  }
}
