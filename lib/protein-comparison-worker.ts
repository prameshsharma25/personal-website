import {
  compareProteins,
  structuralComparison,
  structuralInputPdb,
  type ComparisonMode,
  type StructuralAlignmentOutput,
} from './protein-comparison';
import type { ProteinInput } from './protein-annotations';
self.onmessage = async (
  event: MessageEvent<{
    primary: ProteinInput;
    primaryChain: string;
    comparison: ProteinInput;
    comparisonChain: string;
    mode: ComparisonMode;
  }>
) => {
  try {
    const { primary, primaryChain, comparison, comparisonChain, mode } =
      event.data;
    if (mode !== 'structure' && mode !== 'sequence')
      throw new Error('Choose an available alignment method.');
    if (mode === 'sequence') {
      self.postMessage({
        result: compareProteins(
          primary,
          primaryChain,
          comparison,
          comparisonChain
        ),
      });
      return;
    }
    const moving = structuralInputPdb(comparison, comparisonChain);
    const fixed = structuralInputPdb(primary, primaryChain);
    self.postMessage({ progress: 'Searching For A Structural Alignment…' });
    // Load the pinned existing engine as a native module inside this worker.
    // Webpack must leave its Emscripten asset paths intact.
    const url = new URL(
      '/tools/protein-annotations/structural-alignment.mjs',
      self.location.origin
    ).href;
    const { runStructuralAlignment } = await import(
      /* webpackIgnore: true */ url
    );
    const output: StructuralAlignmentOutput = await runStructuralAlignment(
      moving,
      fixed
    );
    self.postMessage({
      result: structuralComparison(
        primary,
        primaryChain,
        comparison,
        comparisonChain,
        output
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : 'The structures could not be aligned.',
    });
  }
};
