import {
    connectMarketplaceSocket,
    disconnectMarketplaceSocket,
    getMarketplaceSocket,
} from './socketClient';

export const initSocket = connectMarketplaceSocket;
export const getSocket = getMarketplaceSocket;
export const disconnectSocket = disconnectMarketplaceSocket;
