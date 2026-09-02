import { Test, TestingModule } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('CartController', () => {
    let controller: CartController;

    const mockCartService = {};

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CartController],
            providers: [{ provide: CartService, useValue: mockCartService }],
        }).compile();

        controller = module.get<CartController>(CartController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
