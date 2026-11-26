import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialInspection,
  resultFilters,
} from '../lib/amyloid-result-filters';
import type { AnalysisGroup, AnalysisModel } from '../lib/amyloid-jobs';
const models: AnalysisModel[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
  id,
  filename: `${id}.pdb`,
  state: id === 'f' ? 'failed' : 'complete',
}));
const member = (id: string, cluster: number | null) => ({
  id,
  cluster,
  rank_score: null,
  selected_rank: null,
  eligibility_reasons: [],
});

test('cluster labels are scoped by group while noise and missing assignments remain separate', () => {
  const groups: AnalysisGroup[] = [
    {
      id: 'group-001',
      ids: ['a', 'b', 'c'],
      clustering_status: 'complete',
      members: [member('a', 0), member('b', 0), member('c', -1)],
      representatives: [{ id: 'b', cluster: 0, size: 2 }],
    },
    {
      id: 'group-002',
      ids: ['d'],
      clustering_status: 'complete',
      members: [member('d', 0)],
    },
    {
      id: 'group-003',
      ids: ['e'],
      clustering_status: 'insufficient_pool_size',
      members: [member('e', null)],
    },
  ];
  const original = JSON.stringify(groups);
  const filters = resultFilters(models, groups);
  assert.deepEqual(
    filters.map((filter) => [filter.key, [...filter.ids]]),
    [
      ['all', ['a', 'b', 'c', 'd', 'e', 'f']],
      ['group-001:0', ['a', 'b']],
      ['group-001:-1', ['c']],
      ['group-002:0', ['d']],
      ['unclustered', ['e', 'f']],
    ]
  );
  assert.equal(filters[1].representative, 'b');
  assert.equal(filters[3].label, 'Group 2 / Cluster 0');
  assert.equal(JSON.stringify(groups), original);
});

test('failed groups cannot present stale labels and unknown members are ignored', () => {
  const filters = resultFilters(models, [
    {
      id: 'failed',
      ids: ['a'],
      clustering_status: 'failed',
      members: [member('a', 0)],
    },
    {
      id: 'ok',
      ids: ['b'],
      clustering_status: 'complete',
      members: [member('b', 1), member('unknown', 1)],
      representatives: [{ id: 'unknown', cluster: 1, size: 2 }],
    },
  ]);
  assert.deepEqual([...filters[1].ids], ['b']);
  assert.equal(filters[1].representative, undefined);
  assert.deepEqual([...filters[2].ids], ['a', 'c', 'd', 'e', 'f']);
});

test('small or unrequested batches keep every structure visible', () => {
  assert.deepEqual(
    [...resultFilters(models, [])[0].ids],
    models.map((model) => model.id)
  );
  assert.deepEqual(resultFilters([], []), [
    { key: 'all', label: 'All Structures', ids: new Set() },
  ]);
});

test('initial inspection follows the diversity shortlist rather than upload order or cluster medoid', () => {
  const items = models.map((model) => ({
    ...model,
    files: { report: 'report', manifest: 'manifest', structure: 'structure' },
  }));
  const groups: AnalysisGroup[] = [
    {
      id: 'g1',
      ids: ['a', 'b', 'c'],
      clustering_status: 'complete',
      shortlist: ['c', 'b'],
      representatives: [{ id: 'a', cluster: 0, size: 3 }],
    },
    { id: 'g2', ids: ['d'], clustering_status: 'complete', shortlist: ['d'] },
  ];
  const before = JSON.stringify({ items, groups });
  assert.deepEqual(initialInspection(items, groups), {
    model: items[2],
    shortlisted: true,
    groupIndex: 0,
    rank: 1,
  });
  assert.equal(JSON.stringify({ items, groups }), before);
});

test('initial inspection never invents eligibility or compare ranks across groups', () => {
  const items = models.map((model) => ({
    ...model,
    files: { report: 'report', manifest: 'manifest', structure: 'structure' },
  }));
  const groups: AnalysisGroup[] = [
    { id: 'g1', ids: ['a'], clustering_status: 'failed', shortlist: ['a'] },
    {
      id: 'g2',
      ids: ['b', 'c'],
      clustering_status: 'complete',
      shortlist: ['unknown', 'c'],
    },
  ];
  assert.deepEqual(initialInspection(items, groups), {
    model: items[2],
    shortlisted: true,
    groupIndex: 1,
    rank: 2,
  });
  assert.equal(initialInspection(items, [])?.shortlisted, false);
  assert.equal(
    initialInspection(items, [
      {
        id: 'g',
        ids: ['b'],
        clustering_status: 'complete',
        shortlist: [],
        members: [{ ...member('b', 0), rank_score: 99 }],
      },
    ])?.model.id,
    'a'
  );
  assert.equal(initialInspection(models, groups), null);
  assert.equal(initialInspection([], []), null);
});
