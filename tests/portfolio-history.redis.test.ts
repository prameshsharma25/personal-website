// Optional real Redis test. Uses synthetic positions in a unique temporary
// namespace and deletes only the exact keys created by this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPortfolioHistoryService } from '../lib/portfolio-history-server';
import type { PortfolioSnapshot } from '../lib/portfolio';

test(
  'Redis atomically keeps latest daily observations, handles duplicate calls, and prunes old days',
  { skip: process.env.TEST_PORTFOLIO_REDIS !== '1', timeout: 30000 },
  async () => {
    const namespace = `portfolio-test-${randomUUID()}`;
    const env = {
      ...process.env,
      PORTFOLIO_PUBLIC_ENABLED: 'true',
      PORTFOLIO_SOURCE: 'snaptrade',
      PORTFOLIO_HISTORY_ENABLED: 'true',
      PORTFOLIO_HISTORY_NAMESPACE: namespace,
      SNAPTRADE_ACCOUNT_ID: '11111111-2222-3333-4444-555555555555',
    };
    const keys = new Set<string>();
    let endpoint = '',
      options: RequestInit = {};
    const request: typeof fetch = async (url, init) => {
      endpoint = String(url);
      options = init!;
      const args = JSON.parse(String(init?.body));
      if (args[0] === 'EVAL')
        for (const key of args.slice(3, 3 + args[2])) {
          assert.ok(
            key.startsWith(`personal-website:portfolio:v1:{${namespace}:`)
          );
          keys.add(key);
        }
      return fetch(url, init);
    };
    let now = Date.parse('2024-01-02T22:00:00Z');
    const service = createPortfolioHistoryService(env, request, () => now);
    const snapshot = (asOf: string, value: number): PortfolioSnapshot => ({
      total: 5000,
      currency: 'USD',
      balanceAsOf: asOf,
      holdingsAsOf: asOf,
      incompleteHoldings: false,
      holdings: [
        {
          symbol: 'TEST',
          name: 'Synthetic Test',
          percent: 10,
          marketValue: value,
        },
      ],
    });
    try {
      assert.equal(
        await service.record(snapshot('2024-01-02T21:00:00Z', 100)),
        'saved'
      );
      now = Date.parse('2026-11-27T23:00:00Z');
      assert.equal(
        await service.record(snapshot('2026-11-27T19:00:00Z', 400)),
        'saved'
      );
      await Promise.all([
        service.record(snapshot('2026-11-27T20:00:00Z', 450)),
        service.record(snapshot('2026-11-27T21:00:00Z', 500)),
        service.record(snapshot('2026-11-27T18:00:00Z', 300)),
      ]);
      assert.equal(
        await service.record(snapshot('2026-11-27T21:00:00Z', 500)),
        'unchanged'
      );
      assert.deepEqual(await service.read('TEST'), {
        status: 'available',
        symbol: 'TEST',
        points: [{ asOf: '2026-11-27T21:00:00.000Z', value: 500 }],
      });
      // 02:00 UTC belongs to the prior New York calendar day.
      assert.equal(
        await service.record(snapshot('2026-11-27T02:00:00Z', 350)),
        'saved'
      );
      const history = await service.read('TEST');
      assert.equal(history.points.length, 2);
      assert.deepEqual(
        history.points.map((p) => p.value),
        [350, 500]
      );
      assert.deepEqual((await service.read('ABSENT')).points, []);
    } finally {
      if (keys.size) {
        const cleanup = await fetch(endpoint, {
          ...options,
          body: JSON.stringify(['DEL', ...keys]),
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(cleanup.status, 200);
        const result = await cleanup.json();
        assert.equal(result.result, keys.size);
      }
    }
  }
);
