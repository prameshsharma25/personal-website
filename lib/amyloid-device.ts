import type { InputFile } from './amyloid-inspector';
import type { AnalysisModel, AnalysisGroup } from './amyloid-jobs';
import type { DeviceDiagnostics } from './amyloid-diagnostics';

export const DEVICE_LIMITS = {
  files: 125,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
};
export type DeviceResult = {
  structures: AnalysisModel[];
  elapsed_seconds: number;
  clustering_status: 'not_requested' | 'requested';
  groups: AnalysisGroup[];
  warnings: string[];
};
export type DeviceMessage =
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
    };
export type DeviceArtifacts = Record<string, InputFile[]>;

export function validateDeviceFiles(files: Pick<File, 'name' | 'size'>[]) {
  if (!files.length || files.length > DEVICE_LIMITS.files)
    throw new Error(`Select between 1 and ${DEVICE_LIMITS.files} structures.`);
  if (new Set(files.map((file) => file.name)).size !== files.length)
    throw new Error('Rename duplicate filenames before analysis.');
  if (files.some((file) => !/\.(pdb|cif|mmcif)$/i.test(file.name)))
    throw new Error(
      'Choose PDB or mmCIF coordinate files. Open JSON results in Open Existing Reports.'
    );
  if (
    files.some((file) => !file.size || file.size > DEVICE_LIMITS.fileBytes) ||
    files.reduce((sum, file) => sum + file.size, 0) > DEVICE_LIMITS.totalBytes
  )
    throw new Error(
      `Choose nonempty files up to ${DEVICE_LIMITS.fileBytes / 1024 ** 2} MB each and ${DEVICE_LIMITS.totalBytes / 1024 ** 2} MB total.`
    );
}
