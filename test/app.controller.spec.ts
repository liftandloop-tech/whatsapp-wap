import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return service health status', () => {
      const result = appController.getHealth();
      expect(result).toHaveProperty('status', 'UP');
      expect(result).toHaveProperty('service', 'WhatsApp Engine');
      expect(result).toHaveProperty('timestamp');
    });
  });
});
