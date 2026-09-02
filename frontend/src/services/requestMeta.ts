export function createIdempotencyKey(): string {
    return crypto.randomUUID();
}

export function withIdempotencyKey(key = createIdempotencyKey()): {
    'Idempotency-Key': string;
} {
    return { 'Idempotency-Key': key };
}
