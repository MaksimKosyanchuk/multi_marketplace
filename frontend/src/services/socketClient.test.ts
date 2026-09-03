import { io } from 'socket.io-client';
import {
    connectMarketplaceSocket,
    disconnectMarketplaceSocket,
    subscribeToAuction,
} from './socketClient';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

describe('marketplace socket reconnect', () => {
    const socket = {
        connected: true,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        disconnectMarketplaceSocket();
        vi.mocked(io).mockReturnValue(socket as never);
    });

    it('resubscribes active auction rooms and refreshes REST data after reconnect', async () => {
        const onReconnect = vi.fn().mockResolvedValue(undefined);
        connectMarketplaceSocket('token', onReconnect);
        const connectHandler = vi.mocked(socket.on).mock.calls.find(
            ([event]) => event === 'connect',
        )?.[1] as (() => void) | undefined;
        expect(connectHandler).toBeDefined();
        connectHandler?.();

        socket.emit.mockImplementationOnce(
            (_event: string, _payload: unknown, callback: (response: unknown) => void) =>
                callback({ subscribed: true }),
        );
        await subscribeToAuction('auction-1');
        socket.connected = false;
        connectMarketplaceSocket('token', onReconnect);
        socket.connected = true;
        connectHandler?.();

        expect(onReconnect).toHaveBeenCalledTimes(1);
        expect(socket.emit).toHaveBeenCalledWith(
            'auction_subscribe',
            { auctionId: 'auction-1' },
            expect.any(Function),
        );
    });
});
