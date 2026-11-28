import { useState } from 'react';
import { ACCESSION } from '../lib/protein-annotations';
import styles from '../styles/ProteinAnnotations.module.css';

export default function ProteinAccessionLoader({
  slot,
  disabled,
  loading,
  onLoad,
  onCancel,
}: {
  slot: 1 | 2;
  disabled: boolean;
  loading: boolean;
  onLoad: (accession: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const id = `comparison-uniprot-${slot}`;
  return (
    <form
      className={styles.accessionLoader}
      aria-label={`Load Protein ${slot} From UniProt`}
      onSubmit={(e) => {
        e.preventDefault();
        const accession = value.trim().toUpperCase();
        if (!ACCESSION.test(accession)) {
          setError(
            'Enter a canonical UniProt accession, such as Q96AE4. For an isoform, upload its structure instead.'
          );
          return;
        }
        setError('');
        onLoad(accession);
      }}
    >
      <h3>Or Load From UniProt</h3>
      <label htmlFor={id}>UniProt Accession For Protein {slot}</label>
      <div className={styles.inline}>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          maxLength={15}
          placeholder="For Example, Q96AE4"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled || loading}
        />
        <button type="submit" disabled={disabled || loading || !value.trim()}>
          {loading ? `Loading Protein ${slot}…` : `Load Protein ${slot}`}
        </button>
        {loading && (
          <button type="button" onClick={onCancel}>
            Cancel Loading Protein {slot}
          </button>
        )}
      </div>
      <p className={styles.small}>
        Retrieves an existing AlphaFold DB prediction for this accession.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
