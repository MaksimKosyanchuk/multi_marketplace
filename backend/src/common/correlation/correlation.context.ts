import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(
    correlationId: string,
    callback: () => T,
): T {
    return storage.run(correlationId, callback);
}

export function getCorrelationId(): string {
    return storage.getStore() ?? randomUUID();
}
