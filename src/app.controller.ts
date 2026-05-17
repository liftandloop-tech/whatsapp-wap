import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'UP',
      service: 'WhatsApp Engine',
      timestamp: new Date().toISOString(),
    };
  }
}
