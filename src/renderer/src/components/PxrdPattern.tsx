import { useEffect, useRef, useState } from 'react';
import type { DiffractionInput, EntryRow } from '../../../shared/types';
import {
  PXRD_FWHM_TWO_THETA,
  PXRD_RANGE,
  serializePxrdProfile,
  type PxrdPeak
} from '../pxrd';
import { startPxrdTask } from '../pxrdTask';
import PxrdInfo from './PxrdInfo';
import type { PxrdRequest, PxrdResponse } from '../pxrdTask';
import { MAX_PATTERN_BYTES, parsePersonalPattern, usePatternComparison, WAVELENGTH_PRESETS } from '../patternComparison';

interface Props { entry: EntryRow }

const MIN_CHART_WIDTH = 220;
const MARGIN = { left: 52, right: 14, top: 12, bottom: 42 };
const MIN_CHART_HEIGHT = MARGIN.top + MARGIN.bottom + 1;
const ImportError = globalThis.Error;

export default function PxrdPattern({ entry }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: MIN_CHART_WIDTH, height: MIN_CHART_HEIGHT });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(MIN_CHART_WIDTH, Math.floor(entry.contentRect.width));
      const height = Math.max(MIN_CHART_HEIGHT, Math.floor(entry.contentRect.height));
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const { width: WIDTH, height: HEIGHT } = size;
  const [source, setSource] = useState<{ entry:EntryRow; input:DiffractionInput } | null>(null);
  const [sourceStatus, setSourceStatus] = useState<{entry:EntryRow; value:'loading'|'ready'|'error'}>({entry,value:'loading'});
  const status = sourceStatus.entry === entry ? sourceStatus.value : 'loading';
  const [fwhm, setFwhm] = useState(PXRD_FWHM_TWO_THETA);
  const { wavelength, setWavelength, imported, setImported } = usePatternComparison();
  const [importError, setImportError] = useState<string | null>(null);
  const importSequence = useRef(0);
  useEffect(() => () => { importSequence.current++; }, []);
  const [hoveredPeak, setHoveredPeak] = useState<PxrdPeak | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [calculation, setCalculation] = useState<{ request:PxrdRequest; response?:PxrdResponse; error?:string } | null>(null);
  const [retry, setRetry] = useState(0);
  const input = source?.entry === entry ? source.input : null;

  useEffect(() => {
    let active = true;
    setSource(null);
    setSourceStatus({entry,value:'loading'});
    window.cifApi.getDiffractionInput(entry.id).then(
      (value) => { if (active) { setSource({entry,input:value}); setSourceStatus({entry,value:'ready'}); } },
      () => { if (active) setSourceStatus({entry,value:'error'}); }
    );
    return () => { active = false; };
  }, [entry,retry]);

  useEffect(() => {
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
  const importedPath = imported?.normalized.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.twoTheta).toFixed(2)},${y(point.intensity).toFixed(2)}`).join(' ');
  const noOverlap = imported && (imported.original.at(-1)!.twoTheta < PXRD_RANGE.min || imported.original[0].twoTheta > PXRD_RANGE.max);

  async function importPattern(file: File): Promise<void> {
    const sequence = ++importSequence.current;
    setImportError(null);
    try {
      if (file.size > MAX_PATTERN_BYTES) throw new ImportError('Pattern exceeds the 4 MiB file limit.');
      const pattern = parsePersonalPattern(await file.text(), file.name);
      if (sequence === importSequence.current) setImported(pattern);
    } catch (error) {
      if (sequence === importSequence.current) setImportError(error instanceof ImportError ? error.message : 'Could not read pattern.');
    }
  }

  async function exportPattern(): Promise<void> {
    if (!response) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await window.cifApi.exportPxrd(entry.id, serializePxrdProfile(profile));
      if (result.exported && responseRef.current === response) setExportMessage(`Exported ${result.fileName ?? 'PXRD pattern'}`);
    } catch (error) {
      if (responseRef.current === response) setExportMessage(error instanceof Error ? error.message : 'Could not export PXRD pattern.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section aria-label="Simulated PXRD pattern" data-testid="pxrd-pattern" data-calculation-ms={response?.calculationMs} data-calculation-status={response?.result.status} className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-stroke bg-white">
      <div data-testid="pxrd-toolbar" className="z-[1] flex min-w-0 shrink-0 items-center gap-1 border-b border-stroke bg-[#f7f9fb] px-1.5 py-1 text-xs text-[#2f4052]">
        <div role="group" aria-label="Simulation settings" className="flex shrink-0 items-center gap-1">
          <label className="flex items-center gap-1 whitespace-nowrap font-medium">
            λ
            <select
              aria-label="PXRD wavelength in angstroms"
              data-testid="pxrd-wavelength-input"
              value={wavelength}
              onChange={(event) => {
                setWavelength(Number(event.currentTarget.value));
              }}
              className="h-6 rounded-sm border border-[#aeb8c2] bg-white px-1 text-xs font-normal text-[#202020] outline-none focus:border-accent"
            >{WAVELENGTH_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select>
          </label>
          <label className="flex items-center gap-1 whitespace-nowrap font-medium">
            FWHM (2θ)
            <span className="pxrd-fwhm-field">
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
                className="h-6 rounded-sm border border-[#aeb8c2] bg-white text-right text-xs font-normal text-[#202020] outline-none focus:border-accent"
              />
              <span className="pxrd-fwhm-unit" aria-hidden="true">°</span>
            </span>
          </label>
        </div>
        <div role="group" aria-label="Pattern comparison" className="flex shrink-0 items-center gap-1 border-l border-stroke pl-1">
          <label title="Import a measured pattern for comparison" className="btn-w32 relative h-6 cursor-pointer whitespace-nowrap px-1.5 py-0 focus-within:outline focus-within:outline-2 focus-within:outline-accent">Import .xy<input aria-label="Import personal XY pattern" className="sr-only" type="file" accept=".xy" onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importPattern(file);
          }} /></label>
          <button disabled={!imported} aria-label="Clear imported pattern" title="Clear imported pattern" className="btn-w32 h-6 px-1.5 py-0" onClick={() => { importSequence.current++; setImported(null); setImportError(null); }}>Clear</button>
        </div>
        <div role="group" aria-label="Export pattern" className="flex shrink-0 items-center border-l border-stroke pl-1">
          <button className="btn-w32 h-6 w-[4.5rem] whitespace-nowrap px-1.5 py-0" disabled={profile.length === 0 || exporting} onClick={() => void exportPattern()}>
            {exporting ? 'Exporting…' : 'Export .xy'}
          </button>
        </div>
        {response && <PxrdInfo result={response.result} />}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[10px]">
        {exportMessage && <span role="status" className="max-w-40 truncate text-[#2f6f3e]" title={exportMessage}>{exportMessage}</span>}
        <span className="text-blue-700">Blue: simulation</span>
        {imported && <><span className="break-all text-red-700">Red: {imported.fileName} (maximum = 100)</span><span>Comparison requires matching wavelengths. Imported angles stay unchanged; display clips to 5–80°.</span></>}
        {noOverlap && <span role="status">Imported pattern has no overlap with 5–80°.</span>}
        {importError && <span role="alert" className="text-red-700">{importError}</span>}
      </div>
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
          <defs><clipPath id="pxrd-plot-clip"><rect x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
          {imported && <path data-role="pxrd-imported-profile" d={importedPath} clipPath="url(#pxrd-plot-clip)" fill="none" stroke="#d00000" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />}
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
          <text x="14" y={MARGIN.top + plotHeight / 2} textAnchor="middle" fontSize={Math.min(12, (HEIGHT - MARGIN.bottom) / 10)} fill="#34495e" transform={`rotate(-90 14 ${MARGIN.top + plotHeight / 2})`}>Relative intensity (%)</text>
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
