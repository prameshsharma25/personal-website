import styles from '../styles/Interface.module.css';

export default function ChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={styles.choice}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && (
            <span aria-hidden="true">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
