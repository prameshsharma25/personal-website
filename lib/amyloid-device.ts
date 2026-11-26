import type { InputFile } from './amyloid-inspector';
import type { AnalysisModel, AnalysisGroup } from './amyloid-jobs';
import type {
  CheckpointSummary,
  CheckpointFailure,
} from './amyloid-checkpoints';
import type { DeviceDiagnostics } from './amyloid-diagnostics';
import type {
  DescriptorEntry,
  DescriptorInit,
  DescriptorWorkers,
} from './amyloid-descriptor-pool';
import type { AlignmentWorkers } from './amyloid-alignment-pool';

export const DEVICE_LIMITS = {
  files: 125,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
};
export type DeviceResult = {
  exports?: { summary: string; shortlist: string };
  structures: AnalysisModel[];
  recovery?: {
    resumed: boolean;
    reused_descriptors: number;
    reused_alignments: number;
  };
  elapsed_seconds: number;
  clustering_status: 'not_requested' | 'requested';
  groups: AnalysisGroup[];
  warnings: string[];
  descriptor_execution: {
    requested_workers: DescriptorWorkers;
    workers: number;
    fallback: string | null;
    setup_seconds: number;
    calculation_seconds: number;
    merge_seconds: number;
    peak_python_memory_bytes: number | null;
    structure_timings: { id: string; elapsed_seconds: number }[];
  };
  alignment_execution: {
    requested_workers: AlignmentWorkers;
    workers: number;
    fallback: string | null;
    alignment_elapsed_seconds: number;
  };
};
export type DeviceMessage =
  | { type: 'checkpoint'; summary: CheckpointSummary }
  | { type: 'checkpoint-warning'; message: string; failure?: CheckpointFailure }
  | {
      type: 'descriptor-init';
      requestId: number;
      count: number;
      config: DescriptorInit;
    }
  | {
      type: 'descriptor-run';
      requestId: number;
      index: number;
      entry: DescriptorEntry;
      bytes: ArrayBuffer;
    }
  | { type: 'descriptor-stop'; requestId: number }
  | {
      type: 'alignment-init';
      requestId: number;
      choice: AlignmentWorkers;
      tasks: number;
      script: ArrayBuffer;
      binary: ArrayBuffer;
    }
  | { type: 'alignment-run'; requestId: number; a: ArrayBuffer; b: ArrayBuffer }
  | { type: 'alignment-stop'; requestId: number }
  | { type: 'diagnostics'; diagnostics: DeviceDiagnostics }
  | {
      type: 'progress';
      stage: string;
      completed: number;
      total: number;
      filename: string;
      phase: string;
    }
  | { type: 'model'; model: AnalysisModel }
  | { type: 'error'; message: string }
  | {
      type: 'complete';
      result: DeviceResult;
      artifacts: Record<string, { name: string; bytes: ArrayBuffer }[]>;
      archive: ArrayBuffer;
      checkpointSaved?: boolean;
      checkpointFailure?: CheckpointFailure;
      diagnostics?: DeviceDiagnostics;
    };
export type DeviceArtifacts = Record<string, InputFile[]>;

export function validateDeviceFiles(files: Pick<File, 'name' | 'size'>[]) {
  if (!files.length || files.length > DEVICE_LIMITS.files)
    throw new Error(`Select between 1 and ${DEVICE_LIMITS.files} structures.`);
  if (new Set(files.map((file) => file.name)).size !== files.length)
    throw new Error('Rename duplicate filenames before analysis.');
  if (files.some((file) => !/\.(pdb|cif|mmcif)$/i.test(file.name)))
    throw new Error('Choose PDB or mmCIF coordinate files.');
  if (
    files.some((file) => !file.size || file.size > DEVICE_LIMITS.fileBytes) ||
    files.reduce((sum, file) => sum + file.size, 0) > DEVICE_LIMITS.totalBytes
  )
    throw new Error(
      `Choose nonempty files up to ${DEVICE_LIMITS.fileBytes / 1024 ** 2} MB each and ${DEVICE_LIMITS.totalBytes / 1024 ** 2} MB total.`
    );
}
