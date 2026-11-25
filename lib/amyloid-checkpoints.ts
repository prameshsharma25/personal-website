export {
  acquireCheckpointLock,
  deleteCheckpoint,
  readCheckpointSummary,
  readCheckpointInputs,
} from '../public/tools/amyloid-device/v1/checkpoints.mjs';
export type CheckpointSummary = {
  format: number;
  id: string;
  inputCount: number;
  inputBytes: number;
  descriptors: number;
  alignments: number;
  status: 'incomplete' | 'complete';
  updatedAt: number;
};
export type CheckpointInput = {
  files: { name: string; bytes: ArrayBuffer }[];
  confidence: ArrayBuffer | null;
  compare: boolean;
  settings: {
    min_cluster_size: number;
    min_samples: number;
    max_candidates: number;
  };
  descriptorWorkers: 'auto' | 1 | 2 | 4;
  alignmentWorkers: 'auto' | 1 | 2 | 4;
};
