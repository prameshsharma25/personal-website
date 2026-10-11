export const researchAreas = ['Computational biology', 'Bioinformatics', 'Machine learning'] as const;
export interface Opportunity {
  id: string;
  professor: string;
  lab: string;
  university: string;
  location: string;
  country: string;
  areas: string[];
  summary: string;
  status: 'advertised' | 'general';
  intake: string | null;
  deadline: string | null;
  deadlineDetails: string | null;
  funding: string | null;
  eligibility: string | null;
  applicationDetails: string | null;
  applicationUrl: string | null;
  sourceUrl: string;
  evidence: string;
  lastChecked: string;
}
export function listingStatus(post: Opportunity, today: string) {
  if (post.deadline && post.deadline < today) return 'Expired';
  if (Date.parse(today) - Date.parse(post.lastChecked) > 45 * 86400000) return 'Needs recheck';
  return post.status === 'advertised' ? 'Advertised opening' : 'General invitation';
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function countryLabel(code: string) {
  try { return countryNames.of(code) || code; } catch { return code; }
}
