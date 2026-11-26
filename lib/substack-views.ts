export type SubstackViews = {
  status: 'disabled' | 'unavailable' | 'available';
  views: number | null;
  checkedAt: string | null;
  windowMinutes: 30;
};

export const emptySubstackViews = (
  status: 'disabled' | 'unavailable' = 'unavailable'
): SubstackViews => ({
  status,
  views: null,
  checkedAt: null,
  windowMinutes: 30,
});
