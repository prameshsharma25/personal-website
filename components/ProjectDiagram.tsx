import { useId } from 'react';
import type { ResearchProject } from '../lib/research-projects';
import structures from '../data/project-structures.json';
import ProjectMolecule, { type ProjectStructure } from './ProjectMolecule';
import AmmperDiagram from './AmmperDiagram';
import styles from '../styles/ResearchProjects.module.css';

const colors = ['#9af5c9', '#80d8ff', '#c6b2ff'];
const points = Array.from({ length: 27 }, (_, i) => {
  const cluster = Math.floor(i / 9);
  const angle = (i % 9) * 2.399;
  const radius = 12 + (i % 4) * 10;
  return {
    cluster,
    x: Number(([119, 340, 242][cluster] + Math.cos(angle) * radius).toFixed(2)),
    y: Number(([106, 112, 228][cluster] + Math.sin(angle) * radius).toFixed(2)),
  };
});
const attention = [
  0.18, 0.27, 0.12, 0.38, 0.89, 0.24, 0.31, 0.19, 0.72, 0.35, 0.22, 0.92, 0.3,
  0.15, 0.24, 0.36,
];
const positions = [4, 8, 11];

function Scene({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <g className={styles.scene} data-active={active}>
      {children}
    </g>
  );
}

type DiagramMotion = { step: number; running: boolean; visible: boolean };

function MolecularCartoon({
  model,
  x,
  y,
  size,
  enabled,
  running,
}: {
  model: ProjectStructure;
  x: number;
  y: number;
  size: number;
  enabled: boolean;
  running: boolean;
}) {
  return (
    <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
      <ProjectMolecule model={model} enabled={enabled} running={running} />
    </foreignObject>
  );
}

function Clusters({ medoids, active }: { medoids: boolean; active: boolean }) {
  return (
    <>
      {[
        [119, 106],
        [340, 112],
        [242, 228],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse
            cx={x}
            cy={y}
            rx="72"
            ry="53"
            fill={colors[i]}
            fillOpacity="0.045"
            stroke={colors[i]}
            strokeOpacity="0.3"
            strokeDasharray="4 6"
          />
          <text x={x} y={y - 66} textAnchor="middle" fill={colors[i]}>
            Group {String.fromCharCode(65 + i)}
          </text>
        </g>
      ))}
      {points.map((point, i) => (
        <g
          key={i}
          className={styles.clusterPoint}
          style={{
            transform: active
              ? 'translate(0px, 0px)'
              : `translate(${42 + ((i * 47) % 390) - point.x}px, ${40 + ((i * 71) % 235) - point.y}px)`,
            transitionDelay: `${(i % 9) * 35}ms`,
          }}
        >
          <circle
            cx={point.x}
            cy={point.y}
            r={i % 9 === 0 ? 6 : 4}
            fill={colors[point.cluster]}
            opacity={medoids && i % 9 !== 0 ? 0.35 : 0.9}
            className={styles.modelPoint}
          />
          {i % 9 === 0 && (
            <circle
              cx={point.x}
              cy={point.y}
              r="15"
              fill="none"
              stroke={colors[point.cluster]}
              className={styles.medoid}
              opacity={medoids ? 1 : 0}
            />
          )}
        </g>
      ))}
      <g fill="#899a91">
        <circle cx="52" cy="218" r="3" />
        <circle cx="414" cy="248" r="3" />
        <circle cx="232" cy="64" r="3" />
      </g>
      <text x="35" y="270" className={styles.svgMuted}>
        {medoids ? 'Ring = Medoid' : 'Ungrouped = Outliers'}
      </text>
    </>
  );
}

function BriDiagram({ step, running, visible }: DiagramMotion) {
  return (
    <>
      <Scene active={step === 0}>
        <MolecularCartoon
          model="rfahAlpha"
          x={133}
          y={142}
          size={230}
          enabled={visible && step === 0}
          running={running}
        />
        <circle cx="133" cy="142" r="98" className={styles.orbit} />
        <path d="M240 142 H286 m-8 -6 8 6 -8 6" className={styles.flow} />
        <g transform="translate(308 75)">
          <rect
            x="-15"
            y="-16"
            width="137"
            height="137"
            rx="12"
            className={styles.panel}
          />
          {[48, 75, 38, 86, 62, 44].map((width, i) => (
            <rect
              key={i}
              x="0"
              y={i * 16}
              width={width}
              height="6"
              rx="3"
              fill="currentColor"
              opacity={0.45 + i * 0.08}
            />
          ))}
        </g>
        <text x="133" y="272" textAnchor="middle">
          Rotate / Translate
        </text>
        <text x="362" y="238" textAnchor="middle">
          Same Descriptor
        </text>
        <text x="133" y="293" textAnchor="middle" className={styles.svgMuted}>
          RfaH · 2OUG
        </text>
      </Scene>
      <Scene active={step === 1}>
        <text x="238" y="30" textAnchor="middle">
          Pairwise Distances
        </text>
        {Array.from({ length: 100 }, (_, i) => {
          const row = Math.floor(i / 10),
            col = i % 10;
          const same = Math.floor(row / 3) === Math.floor(col / 3);
          return (
            <rect
              key={i}
              x={132 + col * 22}
              y={48 + row * 22}
              width="18"
              height="18"
              rx="3"
              fill="currentColor"
              opacity={
                row === col ? 0.06 : same ? 0.2 : 0.5 + ((row + col) % 4) * 0.12
              }
            />
          );
        })}
        <text
          x="100"
          y="158"
          textAnchor="middle"
          transform="rotate(-90 100 158)"
          className={styles.svgMuted}
        >
          Models
        </text>
        <text x="240" y="294" textAnchor="middle" className={styles.svgMuted}>
          Darker Blocks = More Similar
        </text>
        <path d="M126 46 H352" className={styles.scanLine} />
      </Scene>
      <Scene active={step === 2 || step === 3}>
        <Clusters medoids={step === 3} active={step >= 2} />
      </Scene>
    </>
  );
}

function CaatDiagram({ step, running, visible }: DiagramMotion) {
  const original = 'MKVAFQGITLNEASRG';
  const variant = 'MKVALQGIALNDASRG';
  return (
    <>
      <Scene active={step === 0}>
        <text x="240" y="29" textAnchor="middle">
          Inside The Model
        </text>
        {Array.from({ length: 144 }, (_, i) => {
          const row = Math.floor(i / 12),
            col = i % 12;
          const highlight = [3, 7, 10].includes(col);
          return (
            <rect
              key={i}
              x={133 + col * 18}
              y={45 + row * 18}
              width="15"
              height="15"
              rx="2"
              fill="currentColor"
              opacity={
                highlight
                  ? 0.45 + ((row + col) % 4) * 0.15
                  : 0.05 + ((row * 7 + col * 3) % 7) * 0.024
              }
            />
          );
        })}
        <rect
          x="185"
          y="41"
          width="22"
          height="221"
          rx="4"
          fill="none"
          stroke="currentColor"
          className={styles.pulse}
        />
        <text x="240" y="290" textAnchor="middle" className={styles.svgMuted}>
          Residue × Residue Attention
        </text>
      </Scene>
      <Scene active={step === 1}>
        <text x="240" y="30" textAnchor="middle">
          Positions Worth Testing
        </text>
        <path d="M45 230 H435 M45 230 V62" className={styles.axis} />
        {attention.map((value, i) => (
          <g key={i}>
            <rect
              x={58 + i * 23}
              y={230 - value * 165}
              width="13"
              height={value * 165}
              rx="3"
              fill="currentColor"
              opacity={positions.includes(i) ? 1 : 0.3}
            />
            {positions.includes(i) && (
              <circle
                cx={64.5 + i * 23}
                cy={215 - value * 165}
                r="4"
                fill="#fff"
                className={styles.pulse}
              />
            )}
          </g>
        ))}
        <text x="240" y="269" textAnchor="middle">
          Sequence Position →
        </text>
        <text x="240" y="293" textAnchor="middle" className={styles.svgMuted}>
          Illustrative Attention Profile
        </text>
      </Scene>
      <Scene active={step === 2}>
        <text x="240" y="36" textAnchor="middle">
          Change A Residue. Test The Prediction.
        </text>
        <text x="42" y="83" className={styles.svgMuted}>
          Starting Sequence
        </text>
        <text x="42" y="190" className={styles.svgMuted}>
          Variant
        </text>
        {Array.from(original).map((letter, i) => (
          <g key={i}>
            <rect
              x={42 + i * 25}
              y="96"
              width="22"
              height="32"
              rx="4"
              className={styles.sequenceCell}
            />
            <text
              x={53 + i * 25}
              y="118"
              textAnchor="middle"
              className={styles.sequenceLetter}
            >
              {letter}
            </text>
            <rect
              x={42 + i * 25}
              y="203"
              width="22"
              height="32"
              rx="4"
              fill={positions.includes(i) ? 'currentColor' : '#172a2a'}
            />
            <text
              x={53 + i * 25}
              y="225"
              textAnchor="middle"
              className={styles.sequenceLetter}
              fill={positions.includes(i) ? '#07191c' : '#a9c0c4'}
            >
              {variant[i]}
            </text>
            {positions.includes(i) && (
              <path
                d={`M${53 + i * 25} 137 v32 m-5 -5 5 5 5 -5`}
                className={styles.flow}
              />
            )}
          </g>
        ))}
        <text x="240" y="282" textAnchor="middle" className={styles.svgMuted}>
          Illustrative Sequence & Mutations
        </text>
      </Scene>
      <Scene active={step === 3}>
        <text x="240" y="30" textAnchor="middle">
          One Protein. Two Reference Folds.
        </text>
        <MolecularCartoon
          model="rfahAlpha"
          x={128}
          y={151}
          size={218}
          enabled={visible && step === 3}
          running={running}
        />
        <MolecularCartoon
          model="rfahBeta"
          x={353}
          y={151}
          size={218}
          enabled={visible && step === 3}
          running={running}
        />
        <path d="M240 63 V240" className={styles.axis} strokeDasharray="3 6" />
        <text x="128" y="266" textAnchor="middle">
          α-Helical Hairpin
        </text>
        <text x="353" y="266" textAnchor="middle">
          β-Barrel
        </text>
        <text x="128" y="290" textAnchor="middle" className={styles.svgMuted}>
          RfaH · 2OUG
        </text>
        <text x="353" y="290" textAnchor="middle" className={styles.svgMuted}>
          RfaH · 2LCL
        </text>
      </Scene>
    </>
  );
}

function Assembly({
  x,
  y,
  scale = 1,
  variant = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  variant?: number;
}) {
  const model = structures[`amyloid${variant}` as ProjectStructure];
  return (
    <g transform={`translate(${x} ${y - 25 * scale}) scale(${scale})`}>
      <g
        className={styles.assemblyFloat}
        style={{ animationDelay: `${variant * -1.3}s` }}
      >
        <image href={model.poster} x="-76" y="-76" width="152" height="152" />
      </g>
    </g>
  );
}

function AmyloidDiagram({ step, running, visible }: DiagramMotion) {
  return (
    <>
      <Scene active={step === 0}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} style={{ color: colors[i % 3] }}>
            <g
              transform={
                i >= 3
                  ? `rotate(22 ${94 + (i % 3) * 143} ${112 + Math.floor(i / 3) * 144 - 20})`
                  : undefined
              }
            >
              <Assembly
                x={94 + (i % 3) * 143}
                y={112 + Math.floor(i / 3) * 144}
                scale={0.8}
                variant={i % 3}
              />
            </g>
            <text
              x={100 + (i % 3) * 143}
              y={143 + Math.floor(i / 3) * 144}
              textAnchor="middle"
              className={styles.svgMuted}
            >
              {['2M4J', '2LMN', '2LMP'][i % 3]} · View {Math.floor(i / 3) + 1}
            </text>
          </g>
        ))}
      </Scene>
      <Scene active={step === 1}>
        <MolecularCartoon
          model="amyloid0"
          x={138}
          y={149}
          size={245}
          enabled={visible && step === 1}
          running={running}
        />
        <ellipse cx="142" cy="147" rx="98" ry="106" className={styles.orbit} />
        <path d="M240 145 H275" className={styles.flow} />
        {['Geometry', 'Packing', 'Energetics'].map((label, i) => (
          <g key={label}>
            <rect
              x="288"
              y={58 + i * 49}
              width="150"
              height="36"
              rx="7"
              className={styles.panel}
            />
            <circle cx="304" cy={76 + i * 49} r="3" fill="currentColor" />
            <text x="318" y={82 + i * 49}>
              {label}
            </text>
          </g>
        ))}
        <path d="M288 220 H438" className={styles.axis} strokeDasharray="4 5" />
        <text x="363" y="248" textAnchor="middle" className={styles.svgMuted}>
          Confidence
        </text>
        <text x="363" y="272" textAnchor="middle" className={styles.svgMuted}>
          Kept Separate
        </text>
      </Scene>
      <Scene active={step === 2 || step === 3}>
        {[0, 1, 2].map((group) => (
          <g key={group} style={{ color: colors[group] }}>
            <rect
              x={21 + group * 154}
              y="62"
              width="134"
              height="173"
              rx="15"
              className={styles.groupBox}
            />
            <text x={88 + group * 154} y="37" textAnchor="middle">
              Group {String.fromCharCode(65 + group)}
            </text>
            <g className={styles.modelPoint} opacity={step === 3 ? 0.1 : 0.6}>
              <Assembly
                x={66 + group * 154}
                y={125}
                scale={0.48}
                variant={group}
              />
              <Assembly
                x={111 + group * 154}
                y={191}
                scale={0.48}
                variant={group}
              />
            </g>
            <g
              className={styles.selectedAssembly}
              style={{
                transform:
                  step === 3 ? `translate(0px, -13px)` : 'translate(0px, 0px)',
              }}
            >
              <Assembly
                x={81 + group * 154}
                y={170}
                scale={0.7}
                variant={group}
              />
              <circle
                cx={89 + group * 154}
                cy="145"
                r="53"
                className={styles.medoid}
                fill="none"
                stroke="currentColor"
                opacity={step === 3 ? 1 : 0}
              />
            </g>
          </g>
        ))}
        <text x="240" y="275" textAnchor="middle">
          {step === 3
            ? 'Different Structures. A Focused Review.'
            : 'Structural Similarity → Groups'}
        </text>
      </Scene>
    </>
  );
}

export default function ProjectDiagram({
  project,
  step,
  running,
  visible,
}: {
  project: ResearchProject;
  step: number;
  running: boolean;
  visible: boolean;
}) {
  const id = useId();
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 500 320"
      role="img"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <title
        id={`${id}-title`}
      >{`${project.name}: ${project.steps[step].label}`}</title>
      <desc id={`${id}-description`}>{project.steps[step].visual}</desc>
      <g transform="translate(10 10)">
        {project.id === 'bri' ? (
          <BriDiagram step={step} running={running} visible={visible} />
        ) : project.id === 'caat' ? (
          <CaatDiagram step={step} running={running} visible={visible} />
        ) : project.id === 'amyloid' ? (
          <AmyloidDiagram step={step} running={running} visible={visible} />
        ) : (
          <AmmperDiagram step={step} />
        )}
      </g>
    </svg>
  );
}
