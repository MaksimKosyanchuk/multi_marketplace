import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const fixture = JSON.parse(open('./.k6-auction-fixture.json'));
const accepted = new Counter('auction_bids_accepted');
const rejected = new Counter('auction_bids_rejected');

const tokens = new SharedArray('bidder-tokens', () => fixture.tokens);

export const options = {
    scenarios: {
        concurrent_bids: {
            executor: 'constant-vus',
            vus: Math.min(tokens.length, 8),
            duration: '8s',
        },
    },
    thresholds: {
        checks: ['rate>0.95'],
    },
};

export default function () {
    const token = tokens[(__VU - 1) % tokens.length];
    const amount =
        fixture.startingPrice +
        fixture.minBidIncrement * (__VU + __ITER + 1);
    const res = http.post(
        `${fixture.baseUrl}/auctions/${fixture.auctionId}/bids`,
        JSON.stringify({ amount }),
        {
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
                'idempotency-key': `k6-${__VU}-${__ITER}-${Date.now()}`,
            },
        },
    );
    const ok = check(res, {
        'bid reached the API': (r) =>
            r.status === 201 ||
            r.status === 400 ||
            r.status === 409 ||
            r.status === 429,
    });
    if (res.status === 201) accepted.add(1);
    else if (ok) rejected.add(1);
    sleep(0.05);
}
