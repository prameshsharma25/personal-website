import type { AnalysisGroup, AnalysisModel } from './amyloid-jobs';

// Preserve the pipeline's shortlist order. Scores from different construct
// groups are not comparable, so use the first group with a viewable selection.
export function initialInspection(
  models: AnalysisModel[],
  groups: AnalysisGroup[]
) {
  const viewable = (model: AnalysisModel) =>
    model.state === 'complete' && !!model.files;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.clustering_status !== 'complete') continue;
    for (const [index, id] of (group.shortlist ?? []).entries()) {
      const model = models.find((item) => item.id === id && viewable(item));
      if (model && group.ids.includes(id))
        return { model, shortlisted: true, groupIndex, rank: index + 1 };
    }
  }
  const model = models.find(viewable);
  return model
    ? { model, shortlisted: false, groupIndex: null, rank: null }
    : null;
}

export type ResultFilter = {
  key: string;
  label: string;
  ids: Set<string>;
  group?: AnalysisGroup;
  cluster?: number;
  representative?: string;
};

// Cluster labels are local to a construct group. Never combine Cluster 0 from
// different sequences or stoichiometries, or classify missing results as noise.
export function resultFilters(
  models: AnalysisModel[],
  groups: AnalysisGroup[]
): ResultFilter[] {
  const all = new Set(models.map((model) => model.id));
  const assigned = new Set<string>();
  const filters: ResultFilter[] = [
    { key: 'all', label: 'All Structures', ids: all },
  ];
  groups.forEach((group, index) => {
    if (group.clustering_status !== 'complete') return;
    const clusters = new Map<number, Set<string>>();
    for (const member of group.members ?? []) {
      if (
        !all.has(member.id) ||
        member.cluster === null ||
        !Number.isInteger(member.cluster)
      )
        continue;
      const ids = clusters.get(member.cluster) ?? new Set<string>();
      ids.add(member.id);
      assigned.add(member.id);
      clusters.set(member.cluster, ids);
    }
    for (const cluster of [...clusters.keys()].sort(
      (a, b) => (a < 0 ? Infinity : a) - (b < 0 ? Infinity : b)
    )) {
      const ids = clusters.get(cluster)!;
      const representative = group.representatives?.find(
        (item) => item.cluster === cluster
      )?.id;
      filters.push({
        key: `${group.id}:${cluster}`,
        label: `Group ${index + 1} / ${cluster < 0 ? 'Noise' : `Cluster ${cluster}`}`,
        ids,
        group,
        cluster,
        representative:
          representative && ids.has(representative)
            ? representative
            : undefined,
      });
    }
  });
  const unclustered = new Set(
    models.filter((model) => !assigned.has(model.id)).map((model) => model.id)
  );
  if (unclustered.size)
    filters.push({
      key: 'unclustered',
      label: 'Not Clustered',
      ids: unclustered,
    });
  return filters;
}
