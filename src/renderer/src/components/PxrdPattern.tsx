import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffractionInput, EntryRow } from '../../../shared/types';
import {
  createPxrdProfile,
  DEFAULT_WAVELENGTH,
  PXRD_FWHM_TWO_THETA,
  PXRD_RANGE,
  serializePxrdProfile,
  simulatePxrd,
  type PxrdPeak
} from '../pxrd';

interface Props { entry: EntryRow }

const MIN_CHART_WIDTH = 220;
const MIN_CHART_HEIGHT = 180;
const MARGIN = { left: 52, right: 14, top: 12, bottom: 42 };
const WAVELENGTH_OPTIONS = [
  { symbol: 'Cu', wavelength: 1.5406 },
  { symbol: 'Mo', wavelength: 0.7107 },
  { symbol: 'Co', wavelength: 1.7902 },
  { symbol: 'Ag', wavelength: 0.5609 }
] as const;

export default function PxrdPattern({ entry }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: MIN_CHART_WIDTH, height: MIN_CHART_HEIGHT });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(MIN_CHART_WIDTH, entry.contentRect.width);
      const height = Math.max(MIN_CHART_HEIGHT, entry.contentRect.height);
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const { width: WIDTH, height: HEIGHT } = size;
  const [input, setInput] = useState<DiffractionInput | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fwhm, setFwhm] = useState(PXRD_FWHM_TWO_THETA);
  const [wavelength, setWavelength] = useState(DEFAULT_WAVELENGTH);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [hoveredPeak, setHoveredPeak] = useState<PxrdPeak | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setInput(null);
    setStatus('loading');
    window.cifApi.getDiffractionInput(entry.id).then(
      (value) => { if (active) { setInput(value); setStatus('ready'); } },
      () => { if (active) setStatus('error'); }
    );
    return () => { active = false; };
  }, [entry.id]);

  useEffect(() => {
    setWavelength(DEFAULT_WAVELENGTH);
    setHoveredPeak(null);
    setExportMessage(null);
  }, [entry.id]);

  const peaks = useMemo(
    () => input ? simulatePxrd(entry, input.atomSites, input.symmetryOperations, wavelength) : [],
    [entry, input, wavelength]
  );
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (angle: number) => MARGIN.left + (angle - PXRD_RANGE.min) / (PXRD_RANGE.max - PXRD_RANGE.min) * plotWidth;
  const y = (intensity: number) => MARGIN.top + plotHeight * (1 - intensity / 100);
  const tickStep = plotWidth < 280 ? 40 : plotWidth < 480 ? 20 : 10;
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80].filter(value => value % tickStep === 0);
  const intensityTicks = plotHeight < 160 ? [0, 50, 100] : [0, 25, 50, 75, 100];
  const profile = useMemo(() => createPxrdProfile(peaks, fwhm), [peaks, fwhm]);
  const profilePath = profile.map((point, index) =>
    `${index === 0 ? 'M' : 'L'}${x(point.twoTheta).toFixed(2)},${y(point.intensity).toFixed(2)}`
  ).join(' ');

  async function exportPattern(): Promise<void> {
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await window.cifApi.exportPxrd(entry.id, serializePxrdProfile(profile, includeHeader));
      if (result.exported) setExportMessage(`Exported ${result.fileName ?? 'PXRD pattern'}`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Could not export PXRD pattern.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="Simulated PXRD pattern" data-testid="pxrd-pattern" className="flex min-h-0 flex-col overflow-hidden border border-stroke bg-white">
      <div data-testid="pxrd-toolbar" className="z-[1] flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-stroke bg-[#f7f9fb] px-2 py-1 text-xs text-[#2f4052]">
        <span className="whitespace-nowrap font-semibold">Simulated PXRD pattern</span>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <label className="flex items-center gap-1 whitespace-nowrap font-medium">
            λ
            <select
              aria-label="PXRD wavelength in angstroms"
              data-testid="pxrd-wavelength-select"
              value={wavelength}
              onChange={(event) => {
                setWavelength(Number(event.currentTarget.value));
                setHoveredPeak(null);
                setExportMessage(null);
              }}
              className="h-6 rounded-sm border border-[#aeb8c2] bg-white px-1 text-xs font-normal text-[#202020] outline-none focus:border-accent"
            >
              {WAVELENGTH_OPTIONS.map((option) => (
                <option key={option.symbol} value={option.wavelength}>
                  {option.symbol} ({option.wavelength.toFixed(4)} Å)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 whitespace-nowrap font-medium">
            FWHM (2θ)
            <input
              aria-label="PXRD FWHM in degrees 2 theta"
              data-testid="pxrd-fwhm-input"
              type="number"
              min="0.01"
              max="5"
              step="0.01"
              value={fwhm}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value) && value >= 0.01 && value <= 5) setFwhm(value);
              }}
              className="h-6 w-16 rounded-sm border border-[#aeb8c2] bg-white px-1 text-right text-xs font-normal text-[#202020] outline-none focus:border-accent"
            />
            <span>°</span>
          </label>
          <label className="flex items-center gap-1 whitespace-nowrap text-[10px]">
            <input type="checkbox" checked={includeHeader} onChange={(event) => setIncludeHeader(event.currentTarget.checked)} />
            Header
          </label>
          <button className="btn-w32 h-6 px-2 py-0" disabled={profile.length === 0 || exporting} onClick={() => void exportPattern()}>
            {exporting ? 'Exporting…' : 'Export .xy'}
          </button>
          {exportMessage && <span className="max-w-40 truncate text-[10px] text-[#2f6f3e]" title={exportMessage}>{exportMessage}</span>}
        </div>
      </div>
      <div ref={chartRef} data-testid="pxrd-chart" className="relative min-h-0 min-w-0 flex-1 overflow-auto">
        {status === 'loading' ? (
          <div className="flex h-full items-center justify-center text-xs text-text-dim">Calculating diffraction pattern…</div>
        ) : status === 'error' ? (
          <div className="flex h-full items-center justify-center text-xs text-[#c42b1c]">Could not load diffraction data.</div>
        ) : peaks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5 text-center text-xs text-text-dim">A pattern cannot be calculated because cell or atomic-position data is unavailable.</div>
        ) : (
          <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
          <svg
          width={WIDTH}
          height={HEIGHT}
          className="block"
          role="img"
          aria-label={`Simulated PXRD pattern with ${peaks.length} reflections`}
          onPointerLeave={() => setHoveredPeak(null)}
        >
          <rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} fill="#fbfcfd" />
          {intensityTicks.map((value) => (
            <g key={value}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(value)} y2={y(value)} stroke="#e7ebef" vectorEffect="non-scaling-stroke" />
              <text x={MARGIN.left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#5d6772">{value}</text>
            </g>
          ))}
          {ticks.map((value) => (
            <g key={value}>
              <line x1={x(value)} x2={x(value)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="#f0f2f4" vectorEffect="non-scaling-stroke" />
              <text x={x(value)} y={HEIGHT - 22} textAnchor="middle" fontSize="11" fill="#5d6772">{value}</text>
            </g>
          ))}
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={MARGIN.top + plotHeight} y2={MARGIN.top + plotHeight} stroke="#687786" vectorEffect="non-scaling-stroke" />
          <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="#687786" vectorEffect="non-scaling-stroke" />
          <path data-role="pxrd-profile" d={profilePath} fill="none" stroke="#0000FF" strokeWidth="1.0" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {peaks.map((peak, index) => (
            <line
              key={`${peak.hkl}-${index}`}
              x1={x(peak.twoTheta)}
              x2={x(peak.twoTheta)}
              y1={y(peak.intensity)}
              y2={MARGIN.top + plotHeight}
              stroke="transparent"
              strokeWidth="10"
              vectorEffect="non-scaling-stroke"
              data-role="pxrd-peak-hit-target"
              onPointerEnter={() => setHoveredPeak(peak)}
              onPointerMove={() => setHoveredPeak(peak)}
            />
          ))}
          {hoveredPeak && (() => {
            const peakX = x(hoveredPeak.twoTheta);
            return (
              <g pointerEvents="none">
                <line x1={peakX} x2={peakX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="#d14b00" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })()}
          <text x={MARGIN.left + plotWidth / 2} y={HEIGHT - 5} textAnchor="middle" fontSize="12" fill="#34495e">2θ (degrees)</text>
          <text x="14" y={MARGIN.top + plotHeight / 2} textAnchor="middle" fontSize="12" fill="#34495e" transform={`rotate(-90 14 ${MARGIN.top + plotHeight / 2})`}>Relative intensity (%)</text>
          </svg>
          {hoveredPeak && (() => {
            const peakX = x(hoveredPeak.twoTheta);
            const peakY = y(hoveredPeak.intensity);
            const placeLeft = peakX > WIDTH * 0.72;
            const placeAbove = peakY > 64;
            return (
              <div
                data-testid="pxrd-hover-label"
                className="pointer-events-none absolute z-10 min-w-44 whitespace-nowrap rounded border border-white/25 bg-[#17212b]/95 px-2.5 py-1.5 text-[13px] font-medium leading-5 text-white shadow-lg"
                style={{
                  left: `${peakX / WIDTH * 100}%`,
                  top: `${peakY / HEIGHT * 100}%`,
                  marginLeft: placeLeft ? -8 : 8,
                  marginTop: placeAbove ? -8 : 8,
                  transform: `translate(${placeLeft ? '-100%' : '0'}, ${placeAbove ? '-100%' : '0'})`
                }}
              >
                <div>2θ = {hoveredPeak.twoTheta.toFixed(4)}°</div>
                <div>h,k,l = ({hoveredPeak.hkl.replace(/\s+/g, ', ')})</div>
              </div>
            );
          })()}
          </div>
        )}
      </div>
    </section>
  );
}
