import { useId, useState } from 'react';
import styles from '../styles/ProteinStudy.module.css';

export default function ProteinStudy() {
  const [position, setPosition] = useState(28);
  const id = useId();
  const blend = position / 100;
  const points = Array.from({ length: 100 }, (_, index) => {
    const t = index / 99, angle = t * Math.PI * 6;
    const a = { x: 180 + Math.sin(angle) * 69 + Math.sin(t * Math.PI * 2) * 30, y: 185 + (t - .5) * 260 + Math.cos(angle) * 18 };
    const b = { x: 180 + Math.cos(t * Math.PI * 4.5) * (92 + Math.sin(t * Math.PI * 2) * 22), y: 185 + Math.sin(t * Math.PI * 4.5) * 65 + (t - .5) * 95 };
    return { x: +(a.x + (b.x - a.x) * blend).toFixed(2), y: +(a.y + (b.y - a.y) * blend).toFixed(2) };
  });
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return <figure className={styles.study}>
    <div className={styles.caption}><span>SEQUENCE → STRUCTURE</span><span aria-hidden="true">01 / ∞</span></div>
    <svg className={styles.drawing} viewBox="0 0 360 370" role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>An abstract protein chain changing shape</title>
      <defs><radialGradient id={`${id}-glow`}><stop stopColor="#add9bd" stopOpacity=".12" /><stop offset="1" stopColor="#add9bd" stopOpacity="0" /></radialGradient></defs>
      <circle cx="180" cy="185" r="175" fill={`url(#${id}-glow)`} />
      <g className={styles.grid} fill="none" stroke="currentColor"><ellipse cx="180" cy="185" rx="145" ry="145" /><ellipse cx="180" cy="185" rx="110" ry="145" /><path d="M20 185H340M180 25V345" strokeDasharray="3 7" /></g>
      <path d={line} fill="none" stroke="#add9bd" strokeWidth="20" opacity=".06" strokeLinejoin="round" strokeLinecap="round" />
      <path className={styles.chain} d={line} pathLength="1" fill="none" stroke="#add9bd" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.filter((_, index) => index % 9 === 0).map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index % 3 === 0 ? 4 : 2.5} fill="#e2f5e8" />)}
    </svg>
    <div className={styles.controls}>
      <label htmlFor={`${id}-shape`}>Explore a change in shape <span aria-hidden="true">↔</span></label>
      <input id={`${id}-shape`} type="range" min="0" max="100" value={position} onChange={event => setPosition(Number(event.target.value))} aria-valuetext={`${position}% between two illustrative shapes`} />
      <figcaption>An illustration of conformational change.</figcaption>
    </div>
  </figure>;
}
