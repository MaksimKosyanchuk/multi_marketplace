import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
    let controller: AnalyticsController;

    const mockAnalyticsService = {
        getDashboardData: jest.fn(),
        generateOrdersCsv: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AnalyticsController],
            providers: [
                {
                    provide: AnalyticsService,
                    useValue: mockAnalyticsService,
                },
            ],
        }).compile();

        controller = module.get<AnalyticsController>(AnalyticsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
