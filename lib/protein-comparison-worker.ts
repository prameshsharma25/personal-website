import { compareProteins } from './protein-comparison';
import type { ProteinInput } from './protein-annotations';
self.onmessage = (
  event: MessageEvent<{
    primary: ProteinInput;
    primaryChain: string;
    comparison: ProteinInput;
    comparisonChain: string;
  }>
) => {
  try {
    const { primary, primaryChain, comparison, comparisonChain } = event.data;
    self.postMessage({
      result: compareProteins(
        primary,
        primaryChain,
        comparison,
        comparisonChain
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : 'The structures could not be compared.',
    });
  }
};
