async function main() {
    const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:3001';
    const tokens = (process.env.LOAD_TOKENS || process.env.LOAD_TOKEN || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean);
    const productId = process.env.LOAD_PRODUCT_ID;
    const quantity = Number(process.env.LOAD_QUANTITY || 1);
    const concurrency = Number(process.env.LOAD_CONCURRENCY || 4);
    const initialStock = Number(process.env.LOAD_INITIAL_STOCK || 2);

    if (tokens.length !== 4 || !productId || quantity !== 1 || concurrency !== 4 || initialStock !== 2) {
        console.error(
            'This scenario requires exactly 4 CUSTOMER JWTs, LOAD_PRODUCT_ID, quantity 1, concurrency 4, and initial stock 2.',
        );
        process.exitCode = 1;
        return;
    }

    const headers = (token) => ({
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
    });

    for (const token of tokens) {
        const response = await fetch(baseUrl + '/cart/items', {
            method: 'POST',
            headers: headers(token),
            body: JSON.stringify({ productId, quantity }),
        });
        if (!response.ok) {
            throw new Error(
                `Unable to prepare cart: HTTP ${response.status} ${await response.text()}`,
            );
        }
    }

    const durations = [];
    let successfulCheckouts = 0;
    let expectedStockRejections = 0;
    let unexpectedErrors = 0;
    let nextRequest = 0;

    async function runCheckout(index) {
        const started = performance.now();
        try {
            const response = await fetch(baseUrl + '/orders/checkout', {
                method: 'POST',
                headers: {
                    ...headers(tokens[index % tokens.length]),
                    'idempotency-key': `load-limited-stock-${index}`,
                },
            });
            if (response.status === 201) {
                successfulCheckouts += 1;
                return;
            }
            const body = await response.text();
            if (response.status === 400 && /unavailable|insufficient stock|stock/i.test(body)) {
                expectedStockRejections += 1;
                return;
            }
            unexpectedErrors += 1;
            console.error(JSON.stringify({ request: index, status: response.status, body }));
        } catch {
            unexpectedErrors += 1;
        } finally {
            durations.push(performance.now() - started);
        }
    }

    const requests = 4;
    const started = performance.now();
    async function worker() {
        while (nextRequest < requests) await runCheckout(nextRequest++);
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, requests) }, worker),
    );

    const elapsed = performance.now() - started;
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];
    console.log(
        JSON.stringify(
            {
                scenario: 'limited-stock checkout',
                endpoint: '/orders/checkout',
                requests,
                concurrency,
                productId,
                quantity,
                initialStock,
                rps: Number((requests / (elapsed / 1000)).toFixed(2)),
                p95LatencyMs: Number(p95.toFixed(2)),
                successfulCheckouts,
                expectedStockRejections,
                errors: unexpectedErrors,
            },
            null,
            2,
        ),
    );
    if (
        successfulCheckouts !== initialStock ||
        expectedStockRejections !== requests - initialStock ||
        successfulCheckouts * quantity > initialStock ||
        unexpectedErrors > 0
    ) {
        console.error(
            'Limited-stock invariant failed: expected 2 successful checkouts and 2 stock rejections.',
        );
        process.exitCode = 1;
    }
}

void main();
