import {
  CHAIN_COLORS,
  CHEMISTRY_COLORS,
  RAINBOW_COLORS,
  SECONDARY_COLORS,
  colorHex,
  type ProteinColorMode,
} from '../lib/protein-colors';
import type { ProteinInput } from '../lib/protein-annotations';
import styles from '../styles/ProteinColorLegend.module.css';

export default function ProteinColorLegend({
  mode,
  comparison = false,
  maxDistance = 0,
  chains = [],
}: {
  mode: ProteinColorMode;
  comparison?: boolean;
  maxDistance?: number;
  chains?: ProteinInput['chains'];
}) {
  const swatch = (label: string, color: string) => (
    <span key={label} className={styles.item}>
      <i style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
  return (
    <div className={styles.legend} aria-label="Structure Color Legend">
      {mode === 'Chainbow' ? (
        <>
          <div className={styles.scale}>
            <span>First Loaded Residue</span>
            <i
              aria-hidden="true"
              style={{
                background: `linear-gradient(to right, ${RAINBOW_COLORS.map(colorHex).join(', ')})`,
              }}
            />
            <span>Last Loaded Residue</span>
          </div>
          <p>Blue to red follows sequence order within each loaded chain.</p>
        </>
      ) : mode === 'Difference' ? (
        <p>Difference: Blue 0 Å To Coral {maxDistance.toFixed(2)} Å</p>
      ) : (
        <div className={styles.swatches}>
          {mode === 'Annotations' && swatch('Reference Annotations', '#60dfd3')}
          {mode === 'Chain' &&
            chains.map((chain, index) =>
              swatch(
                `Chain ${chain.id || 'Unnamed'}`,
                CHAIN_COLORS[index % CHAIN_COLORS.length]
              )
            )}
          {mode === 'Structure' && (
            <>
              {swatch('Protein 1', '#73c5ff')}
              {swatch('Protein 2', '#f6a66a')}
            </>
          )}
          {mode === 'Secondary Structure' &&
            Object.entries(SECONDARY_COLORS).map(([label, color]) =>
              swatch(label, color)
            )}
          {mode === 'Residue Chemistry' &&
            Object.entries(CHEMISTRY_COLORS).map(([label, color]) =>
              swatch(label, color)
            )}
        </div>
      )}
      {mode === 'Secondary Structure' && (
        <p>Assignments come from the displayed coordinates in the 3D viewer.</p>
      )}
      {mode === 'Residue Chemistry' && (
        <p>Colors group residues by amino acid chemistry.</p>
      )}
      <div className={styles.swatches}>
        {comparison &&
          (mode === 'Structure' || mode === 'Difference') &&
          swatch('Unpaired', '#7a8799')}
        {swatch('Selected', comparison ? '#ffdc76' : '#ffc473')}
        {swatch('Hovered', '#f38bff')}
      </div>
    </div>
  );
}
