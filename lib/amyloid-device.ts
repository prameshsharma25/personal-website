import type { InputFile } from './amyloid-inspector';
import type { AnalysisModel } from './amyloid-jobs';

export const DEVICE_LIMITS = {
  files: 5,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 25 * 1024 * 1024,
};
export type DeviceResult = {
  structures: AnalysisModel[];
  elapsed_seconds: number;
  clustering_status: 'not_run_on_device';
  warnings: string[];
};
export type DeviceMessage =
  | {
      type: 'progress';
      stage: string;
      completed: number;
      total: number;
      filename: string;
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
    throw new Error('Select between 1 and 5 structures.');
  if (files.some((file) => !/\.(pdb|cif|mmcif)$/i.test(file.name)))
    throw new Error(
      'Choose PDB or mmCIF coordinate files. Open JSON results in Open Existing Reports.'
    );
  if (
    files.some((file) => !file.size || file.size > DEVICE_LIMITS.fileBytes) ||
    files.reduce((sum, file) => sum + file.size, 0) > DEVICE_LIMITS.totalBytes
  )
    throw new Error('Choose nonempty files up to 10 MB each and 25 MB total.');
}
