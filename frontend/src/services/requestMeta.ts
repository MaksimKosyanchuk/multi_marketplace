export function createIdempotencyKey(): string {
    return crypto.randomUUID();
}

export function createOperationKey(scope: string, id?: string): string {
    const keyName = `${scope}:${id ?? 'new'}`;
    const key =
        sessionStorage.getItem(`marketplace:operation:${keyName}`) ??
        createIdempotencyKey();
    sessionStorage.setItem(`marketplace:operation:${keyName}`, key);
    return key;
}

export function completeOperationKey(scope: string, id?: string): void {
    sessionStorage.removeItem(`marketplace:operation:${scope}:${id ?? 'new'}`);
}

export function withIdempotencyKey(key = createIdempotencyKey()): {
    'Idempotency-Key': string;
} {
    return { 'Idempotency-Key': key };
}
