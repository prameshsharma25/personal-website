import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import ChoiceGroup from './ChoiceGroup';
import type { YouTubeAnalytics } from '../lib/youtube';
import { peakViewDay, viewDays, viewsCsv } from '../lib/youtube-chart';
import styles from '../styles/YouTube.module.css';

const number = (value: number) => new Intl.NumberFormat('en-US').format(value);
const date = (value: string) =>
  new Date(value + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const LEFT = 48,
  TOP = 22,
  BOTTOM = 190;

export default function YouTubeViewsChart({
  report,
}: {
  report: YouTubeAnalytics;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const points = viewDays(report.daily ?? [], report.startDate, report.endDate);
  const [mode, setMode] = useState('daily');
  const [selected, setSelected] = useState(() => {
    const last = points.findLastIndex((point) => point.views !== null);
    return Math.max(0, last);
  });
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width))
    );
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const peak = peakViewDay(points);
  if (!points.length || peak < 0) return null;
  const index = Math.min(selected, points.length - 1);
  const active = points[index];
  const value = (point: (typeof points)[number]) =>
    mode === 'daily' ? point.views : point.cumulative;
  const max = Math.max(1, ...points.map((point) => value(point) ?? 0));
  const WIDTH = Math.max(1, width - LEFT - 12);
  const x = (i: number) => LEFT + ((i + 0.5) / points.length) * WIDTH;
  const y = (count: number) => BOTTOM - (count / max) * (BOTTOM - TOP);
  const activeValue = value(active);
  const description = `${date(active.date)}: ${activeValue === null ? 'Not Reported' : `${number(activeValue)} ${mode === 'daily' ? 'Views' : 'Cumulative Reported Views'}`}`;
  const reported = points.filter((point) => point.views !== null).length;
  // Break the cumulative line at missing days rather than inventing measurements.
  const path = points
    .map((point, i) =>
      point.cumulative === null
        ? ''
        : `${i === 0 || points[i - 1].cumulative === null ? 'M' : 'L'} ${x(i)} ${y(point.cumulative)}`
    )
    .join(' ');

  function inspect(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = ((event.clientX - bounds.left) / bounds.width) * width;
    setSelected(
      Math.max(
        0,
        Math.min(
          points.length - 1,
          Math.floor(((plotX - LEFT) / WIDTH) * points.length)
        )
      )
    );
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([viewsCsv(report.videoId, points)], {
        type: 'text/csv;charset=utf-8',
      })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `youtube-views-${report.videoId}-${report.startDate}-to-${report.endDate}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className={styles.interactiveChart}>
      <div className={styles.chartToolbar}>
        <ChoiceGroup
          label="Views Chart Display"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'cumulative', label: 'Cumulative' },
          ]}
        />
        <button type="button" className={styles.chartButton} onClick={download}>
          Download CSV <span aria-hidden="true">↓</span>
        </button>
      </div>
      <div
        className={styles.chartReadout}
        role="group"
        aria-label="Selected Day Details"
      >
        <div>
          <span className={styles.readoutLabel}>
            {pinned ? 'Pinned Day' : 'Selected Day'}
          </span>
          <time dateTime={active.date}>{date(active.date)}</time>
        </div>
        <div className={styles.readoutValue}>
          <strong>
            {activeValue === null ? 'Not Reported' : number(activeValue)}
          </strong>
          <span>
            {mode === 'daily' ? 'Daily Views' : 'Cumulative Reported Views'}
          </span>
        </div>
      </div>
      <div className={styles.chartStage}>
        <svg
          ref={svg}
          className={styles.chart}
          viewBox={`0 0 ${width} 230`}
          role="img"
          aria-label={
            mode === 'daily'
              ? 'Reported daily video views'
              : 'Cumulative reported video views'
          }
          aria-describedby={`${id}-help`}
          onPointerMove={(event) => {
            if (!pinned || event.buttons) inspect(event);
          }}
          onPointerDown={(event) => {
            inspect(event);
            setPinned(true);
          }}
        >
          <title>
            {mode === 'daily' ? 'Daily' : 'Cumulative reported'} views for the
            selected video
          </title>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={LEFT}
                x2={LEFT + WIDTH}
                y1={y(max * fraction)}
                y2={y(max * fraction)}
                className={styles.gridLine}
              />
              <text x={LEFT - 8} y={y(max * fraction) + 4} textAnchor="end">
                {new Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(max * fraction)}
              </text>
            </g>
          ))}
          {mode === 'daily' ? (
            points.map(
              (point, i) =>
                point.views !== null && (
                  <rect
                    key={point.date}
                    data-date={point.date}
                    className={i === index ? styles.activeBar : styles.viewBar}
                    x={x(i) - Math.max(2, WIDTH / points.length - 3) / 2}
                    y={point.views === 0 ? BOTTOM - 1 : y(point.views)}
                    width={Math.max(2, WIDTH / points.length - 3)}
                    height={Math.max(1, BOTTOM - y(point.views))}
                    rx="2"
                  />
                )
            )
          ) : (
            <>
              <path d={path} className={styles.cumulativeLine} />
              {points.map(
                (point, i) =>
                  point.cumulative !== null && (
                    <circle
                      key={point.date}
                      data-date={point.date}
                      cx={x(i)}
                      cy={y(point.cumulative)}
                      r="2.5"
                      className={styles.dataDot}
                    />
                  )
              )}
            </>
          )}
          <line
            x1={x(index)}
            x2={x(index)}
            y1={TOP}
            y2={BOTTOM}
            className={styles.crosshair}
          />
          {activeValue !== null && (
            <circle
              cx={x(index)}
              cy={y(activeValue)}
              r="5"
              className={styles.activeDot}
            />
          )}
          <text x={LEFT} y="220">
            {date(report.startDate)}
          </text>
          <text x={LEFT + WIDTH} y="220" textAnchor="end">
            {date(report.endDate)}
          </text>
        </svg>
      </div>
      <label className={styles.chartSlider}>
        <span>
          Explore Days{' '}
          <span>
            {index + 1} / {points.length}
          </span>
        </span>
        <input
          type="range"
          min="0"
          max={points.length - 1}
          step="1"
          value={index}
          aria-label="Explore Chart Days"
          aria-valuetext={description}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            setSelected(Number(event.target.value));
            setPinned(true);
          }}
        />
      </label>
      <p id={`${id}-help`} className={styles.caption}>
        Hover to explore. Click or tap to pin a day. Use the slider or arrow
        keys to move through dates.
      </p>
      <div className={styles.chartActions}>
        <button
          type="button"
          className={styles.chartButton}
          onClick={() => {
            setSelected(peak);
            setPinned(true);
          }}
        >
          Peak Day <span>{number(points[peak].views!)} Views ↗</span>
        </button>
        {pinned && (
          <button
            type="button"
            className={styles.chartButton}
            onClick={() => setPinned(false)}
          >
            Unpin Day
          </button>
        )}
      </div>
      <p className={styles.caption}>
        {reported} of {points.length} days reported. Missing dates are not
        treated as zero.
        {mode === 'cumulative' &&
          ' Cumulative views sum the reported days in this period, not lifetime views.'}
      </p>
      <details className={styles.dataTable}>
        <summary>View Daily Data</summary>
        <div className={styles.scroll}>
          <table>
            <caption>Reported Days Only</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Views</th>
                <th scope="col">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {points
                .filter((point) => point.views !== null)
                .map((point) => (
                  <tr key={point.date}>
                    <td>{date(point.date)}</td>
                    <td>{number(point.views!)}</td>
                    <td>{number(point.cumulative!)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
