import { useId } from 'react';
import styles from '../styles/ResearchProjects.module.css';

// A conceptual illustration, deliberately independent of AMMPER simulation output.
const cells = [
  [168, 103, 0.75],
  [219, 87, 0.7],
  [271, 108, 0.8],
  [316, 90, 0.7],
  [125, 146, 0.86],
  [180, 151, 0.94],
  [237, 138, 0.95],
  [294, 151, 0.9],
  [347, 137, 0.8],
  [94, 194, 0.95],
  [150, 205, 1.05],
  [209, 195, 1.05],
  [270, 210, 1.08],
  [329, 199, 1],
  [381, 187, 0.9],
];

export default function AmmperDiagram({ step }: { step: number }) {
  const id = useId();
  const healthy = `${id}-healthy`,
    damaged = `${id}-damaged`,
    inactive = `${id}-inactive`;
  return (
    <>
      <defs>
        {[
          { id: healthy, light: '#e2fff6', mid: '#6acbb7', dark: '#174f4c' },
          { id: damaged, light: '#fff4c9', mid: '#e5af68', dark: '#73452e' },
          { id: inactive, light: '#abb7ba', mid: '#687981', dark: '#26373e' },
        ].map((color) => (
          <radialGradient
            key={color.id}
            id={color.id}
            cx="32%"
            cy="25%"
            r="80%"
          >
            <stop stopColor={color.light} />
            <stop offset=".35" stopColor={color.mid} />
            <stop offset="1" stopColor={color.dark} />
          </radialGradient>
        ))}
        <linearGradient id={`${id}-glass`} x2="1" y2="0">
          <stop stopColor="#ffffff" stopOpacity=".3" />
          <stop offset=".4" stopColor="#ffffff" stopOpacity=".02" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".15" />
        </linearGradient>
      </defs>
      <g className={styles.scene} data-active={step < 3}>
        <text x="240" y="26" textAnchor="middle">
          {
            [
              'Each Cell Is An Agent',
              'Exposure Is Uneven',
              'Individual Histories. Different Fates.',
            ][Math.min(step, 2)]
          }
        </text>
        <path
          d="M45 205 218 55 437 180 260 272Z"
          fill="#75bfc309"
          stroke="#95c1bb33"
        />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} stroke="#95c1bb17" fill="none">
            <path d={`M${75 + i * 34} ${179 - i * 29} l215 125`} />
            <path d={`M${82 + i * 43} ${226 + i * 7} l173 -150`} />
          </g>
        ))}
        {cells.map(([x, y, scale], i) => {
          const injured = step === 2 && [2, 5, 8, 12].includes(i);
          const dead = step === 2 && [6, 10].includes(i);
          const color = dead ? inactive : injured ? damaged : healthy;
          return (
            <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
              <ellipse cx="2" cy="24" rx="23" ry="7" fill="#000" opacity=".3" />
              <g
                className={styles.cellBody}
                style={{ animationDelay: `${i * -0.28}s` }}
              >
                <ellipse
                  rx="20"
                  ry="26"
                  fill={`url(#${color})`}
                  stroke={dead ? '#7c9396' : injured ? '#f1c78e' : '#9aeadb'}
                  strokeWidth=".8"
                />
                <ellipse
                  cx="5"
                  cy="4"
                  rx="10"
                  ry="13"
                  fill="#fff"
                  opacity=".07"
                  stroke="#f5ffff"
                  strokeWidth=".6"
                />
                <circle
                  cx="-5"
                  cy="-6"
                  r="5"
                  fill={injured ? '#854c2f' : '#195256'}
                  opacity=".7"
                />
                <path
                  d="M-12 -13 Q-9 -21 -3 -22"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeOpacity=".5"
                  strokeLinecap="round"
                />
                {!dead && i % 3 === 0 && (
                  <g
                    className={styles.bud}
                    style={{ animationDelay: `${i * -0.3}s` }}
                  >
                    <ellipse
                      cx="18"
                      cy="-20"
                      rx="10"
                      ry="13"
                      fill={`url(#${color})`}
                      stroke="#c0e5cd"
                      strokeWidth=".7"
                    />
                  </g>
                )}
                {dead && (
                  <path
                    d="M-6 -6 6 6 M6 -6 -6 6"
                    stroke="#d7e0df"
                    strokeWidth="1.5"
                  />
                )}
                {injured && (
                  <path
                    d="M-6 -14 -2 -8 -7 -2 1 4"
                    stroke="#fff0ca"
                    strokeWidth="1.4"
                    fill="none"
                  />
                )}
              </g>
            </g>
          );
        })}
        <g className={styles.radiation} opacity={step === 1 ? 1 : 0}>
          {['M73 43 339 239', 'M221 41 108 236', 'M411 64 211 243'].map(
            (path, i) => (
              <g key={path}>
                <path
                  d={path}
                  stroke="#ffd899"
                  strokeWidth="7"
                  strokeOpacity=".08"
                  fill="none"
                />
                <path
                  d={path}
                  className={styles.radiationTrack}
                  style={{ animationDelay: `${i * -0.8}s` }}
                />
              </g>
            )
          )}
          {[
            [145, 96],
            [185, 125],
            [241, 169],
            [288, 207],
            [167, 135],
            [314, 151],
          ].map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill="#ffe6b5"
              className={styles.pulse}
            />
          ))}
        </g>
        {step === 2 ? (
          <g>
            {['Viable', 'Damaged', 'Nondividing'].map((label, i) => (
              <g key={label} transform={`translate(${85 + i * 135} 294)`}>
                <circle r="4" fill={['#91dbc5', '#f1c78e', '#8ea0a5'][i]} />
                <text x="11" y="4" className={styles.svgMuted}>
                  {label}
                </text>
              </g>
            ))}
          </g>
        ) : (
          <text x="240" y="295" textAnchor="middle" className={styles.svgMuted}>
            {step === 0
              ? 'Growth & Budding In A 3D Environment'
              : 'Tracks → Energy Deposits → Cell-Level Damage'}
          </text>
        )}
      </g>
      <g className={styles.scene} data-active={step === 3}>
        <text x="240" y="26" textAnchor="middle">
          From Cell Behavior To Observable Response
        </text>
        <path d="M59 55 V164 H435" className={styles.axis} />
        <path
          d="M65 153 C147 152 170 146 202 112 S264 62 318 62 H429"
          className={styles.growthCurve}
        />
        <text x="85" y="58" className={styles.svgMuted}>
          Population Growth
        </text>
        <text x="432" y="185" textAnchor="end" className={styles.svgMuted}>
          Time →
        </text>
        {['#4d80d9', '#e994c4', '#c6d8d333'].map((color, i) => (
          <g key={color} transform={`translate(${125 + i * 115} 202)`}>
            <path
              d="M-23 0 H23 V57 Q23 72 0 72 Q-23 72 -23 57Z"
              fill={`url(#${id}-glass)`}
              stroke="#bfd4d17c"
            />
            <path
              d="M-19 23 H19 V56 Q19 67 0 67 Q-19 67 -19 56Z"
              fill={color}
              opacity=".7"
            />
            <ellipse cy="23" rx="19" ry="4" fill={color} opacity=".8" />
            <path
              d="M-17 7 V52"
              stroke="#f2ffff"
              strokeOpacity=".3"
              strokeWidth="2"
            />
            <text y="94" textAnchor="middle" className={styles.svgMuted}>
              {['Blue', 'Pink', 'Clear'][i]}
            </text>
            {i < 2 && (
              <path d="M45 38 H66 m-5 -5 5 5 -5 5" className={styles.flow} />
            )}
          </g>
        ))}
      </g>
    </>
  );
}
