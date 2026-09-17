import { useEffect, useRef, useState } from 'react';
import type { DiffractionInput, EntryRow } from '../../../shared/types';
import {
  DEFAULT_WAVELENGTH,
  PXRD_FWHM_TWO_THETA,
  PXRD_RANGE,
  serializePxrdProfile,
  type PxrdPeak
} from '../pxrd';
import { startPxrdTask } from '../pxrdTask';
import type { PxrdRequest, PxrdResponse } from '../pxrdTask';

interface Props { entry: EntryRow }

const MIN_CHART_WIDTH = 220;
const MIN_CHART_HEIGHT = 180;
const MARGIN = { left: 52, right: 14, top: 12, bottom: 42 };

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
  const [source, setSource] = useState<{ entryId:number; input:DiffractionInput } | null>(null);
  const [sourceStatus, setSourceStatus] = useState<{entryId:number; value:'loading'|'ready'|'error'}>({entryId:entry.id,value:'loading'});
  const status = sourceStatus.entryId === entry.id ? sourceStatus.value : 'loading';
  const [fwhm, setFwhm] = useState(PXRD_FWHM_TWO_THETA);
  const [wavelength, setWavelength] = useState(entry.radiation_wavelength_angstrom ?? DEFAULT_WAVELENGTH);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [hoveredPeak, setHoveredPeak] = useState<PxrdPeak | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [calculation, setCalculation] = useState<{ request:PxrdRequest; response?:PxrdResponse; error?:string } | null>(null);
  const [retry, setRetry] = useState(0);
  const input = source?.entryId === entry.id ? source.input : null;

  useEffect(() => {
    let active = true;
    setSource(null);
    setSourceStatus({entryId:entry.id,value:'loading'});
    window.cifApi.getDiffractionInput(entry.id).then(
      (value) => { if (active) { setSource({entryId:entry.id,input:value}); setSourceStatus({entryId:entry.id,value:'ready'}); } },
      () => { if (active) setSourceStatus({entryId:entry.id,value:'error'}); }
    );
    return () => { active = false; };
  }, [entry.id,retry]);

  useEffect(() => {
    setWavelength(entry.radiation_wavelength_angstrom ?? DEFAULT_WAVELENGTH);
    setHoveredPeak(null);
    setExportMessage(null);
  }, [entry.id, entry.radiation_wavelength_angstrom]);

  useEffect(() => {
    setCalculation(null); setHoveredPeak(null); setExportMessage(null);
    if (!input) return;
    const request = {entry,input,wavelength,fwhm};
    return startPxrdTask(request,
      response=>setCalculation({request,response}),
      error=>setCalculation({request,error}));
  }, [entry,input,wavelength,fwhm,retry]);
  // Guard during render too: effects run after a selection/settings change paints.
  const current = calculation?.request.entry === entry && calculation.request.input === input &&
    calculation.request.wavelength === wavelength && calculation.request.fwhm === fwhm ? calculation : null;
  const response = current?.response;
  const responseRef = useRef(response);
  responseRef.current = response;
  const peaks = response?.result.peaks ?? [];
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (angle: number) => MARGIN.left + (angle - PXRD_RANGE.min) / (PXRD_RANGE.max - PXRD_RANGE.min) * plotWidth;
  const y = (intensity: number) => MARGIN.top + plotHeight * (1 - intensity / 100);
  const tickStep = plotWidth < 280 ? 40 : plotWidth < 480 ? 20 : 10;
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80].filter(value => value % tickStep === 0);
  const intensityTicks = plotHeight < 160 ? [0, 50, 100] : [0, 25, 50, 75, 100];
  const profile = response?.profile ?? [];
  const profilePath = profile.map((point, index) =>
    `${index === 0 ? 'M' : 'L'}${x(point.twoTheta).toFixed(2)},${y(point.intensity).toFixed(2)}`
  ).join(' ');

  async function exportPattern(): Promise<void> {
    if (!response) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await window.cifApi.exportPxrd(entry.id, serializePxrdProfile(profile, includeHeader, {result:response.result,fwhm}));
      if (result.exported && responseRef.current === response) setExportMessage(`Exported ${result.fileName ?? 'PXRD pattern'}`);
    } catch (error) {
      if (responseRef.current === response) setExportMessage(error instanceof Error ? error.message : 'Could not export PXRD pattern.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="Simulated PXRD pattern" data-testid="pxrd-pattern" data-calculation-ms={response?.calculationMs} data-calculation-status={response?.result.status} className="flex min-h-0 flex-col overflow-hidden border border-stroke bg-white">
      <div data-testid="pxrd-toolbar" className="z-[1] flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-stroke bg-[#f7f9fb] px-2 py-1 text-xs text-[#2f4052]">
        <span className="whitespace-nowrap font-semibold">Simulated PXRD pattern</span>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <label className="flex items-center gap-1 whitespace-nowrap font-medium">
            λ
            <input
              aria-label="PXRD wavelength in angstroms"
              data-testid="pxrd-wavelength-input"
              type="number"
              min="0.1"
              max="10"
              step="0.0001"
              value={wavelength}
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber;
                if (Number.isFinite(value) && value >= 0.1 && value <= 10) setWavelength(value);
              }}
              className="h-6 w-20 rounded-sm border border-[#aeb8c2] bg-white px-1 text-right text-xs font-normal text-[#202020] outline-none focus:border-accent"
            />
            <span>Å</span>
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
      {response && <details data-testid="pxrd-diagnostics" className="shrink-0 px-2 text-[10px] text-[#4c5260]">
        <summary>{response.result.status === 'incomplete' ? 'Incomplete pattern — reflection limit reached' : response.result.status === 'unsupported' ? 'Unsupported calculation' : 'Calculated X-ray model — assumptions and limits'}</summary>
        <ul className="max-h-24 overflow-auto">{response.result.diagnostics.map(message=><li key={message}>{message}</li>)}</ul>
      </details>}
      <div ref={chartRef} data-testid="pxrd-chart" className="relative min-h-0 min-w-0 flex-1 overflow-auto">
        {status === 'error' || current?.error ? (
          <div role="alert" className="flex h-full items-center justify-center gap-2 text-xs text-[#c42b1c]">{current?.error ?? 'Could not load diffraction data.'}<button className="btn-w32" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>
        ) : status === 'loading' || !response ? (
          <div className="flex h-full items-center justify-center text-xs text-text-dim">Calculating diffraction pattern…</div>
        ) : peaks.length === 0 ? (
          <div className="flex h-full items-center justify-center px-5 text-center text-xs text-text-dim">{response.result.status === 'unsupported' ? response.result.diagnostics.at(-1) : 'No nonzero reflections in the requested 5–80° range.'}</div>
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
