export type AnalysisModel = {
  id: string;
  filename: string;
  state: 'complete' | 'failed';
  error?: string;
  comparison_error?: string;
  classification?: string;
  qc_status?: string;
  warnings?: string[];
  files?: { report: string; manifest: string; structure: string };
};
export type AnalysisGroup = {
  id: string;
  ids: string[];
  clustering_status: string;
  error?: string;
  members?: {
    id: string;
    cluster: number | null;
    rank_score: number | null;
    selected_rank: number | null;
    eligibility_reasons: string[];
  }[];
  representatives?: { cluster: number; id: string; size: number }[];
  shortlist?: string[];
};
export type AnalysisJob = {
  id: string;
  state: string;
  error?: string;
  expires_at: number;
  progress?: { stage: string; completed: number; total: number };
  result?: {
    schema_version: string;
    structures: AnalysisModel[];
    groups: AnalysisGroup[];
    warnings: string[];
    elapsed_seconds: number;
  };
};
export type JobAccess = { id: string; token: string; api: string };
export const JOB_STORAGE_KEY = 'amyloid-analysis-session-v1';
export class JobRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'JobRequestError';
  }
}
export async function jobRequest(
  access: JobAccess,
  suffix = '',
  init: RequestInit = {}
) {
  const response = await fetch(
    `${access.api}/jobs/${encodeURIComponent(access.id)}${suffix}`,
    {
      ...init,
      credentials: 'omit',
      headers: { Authorization: `Bearer ${access.token}`, ...init.headers },
    }
  );
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new JobRequestError(
      typeof problem.detail === 'string'
        ? problem.detail
        : 'The analysis service could not complete the request.',
      response.status
    );
  }
  return response;
}
