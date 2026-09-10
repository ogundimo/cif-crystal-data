import React, { useLayoutEffect, useRef } from 'react';
import type { AtomSiteRow } from '../../../shared/types';

export type CrystalLegendMode = 'vertical' | 'horizontal';

const CPK_COLORS: Record<string, string> = {
  H: '#ffffff', C: '#909090', N: '#3050f8', O: '#ff0d0d', F: '#90e050', Cl: '#1ff01f',
  Br: '#a62929', I: '#940094', P: '#ff8000', S: '#ffff30', B: '#ffb5b5', Si: '#f0c8a0',
  Na: '#ab5cf2', Mg: '#8aff00', Al: '#bfa6a6', K: '#8f40d4', Ca: '#3dff00', Fe: '#e06633',
  Cu: '#c88033', Zn: '#7d80b0', Ga: '#c28f8f', Ge: '#668f8f', As: '#bd80e3', Se: '#ffa100',
  Rb: '#702eb0', Sr: '#00ff00', Y: '#94ffff', Zr: '#94e0e0', Nb: '#73c2c9', Mo: '#54b5b5',
  Ru: '#248f8f', Rh: '#0a7d8c', Pd: '#006985', Ag: '#c0c0c0', Cd: '#ffd98f', In: '#a67573',
  Sn: '#668080', Sb: '#9e63b5', Te: '#d47a00', Cs: '#57178f', Ba: '#00c900', La: '#70d4ff',
  Ce: '#ffffc7', Pr: '#d9ffc7', Nd: '#c7ffc7', Sm: '#8fffc7', Eu: '#61ffc7', Gd: '#45ffc7',
  Tb: '#30ffc7', Dy: '#1fffc7', Ho: '#00ff9c', Er: '#00e675', Tm: '#00d452', Yb: '#00bf38',
  Lu: '#00ab24', Hf: '#4dc2ff', Ta: '#4da6ff', W: '#2194d6', Re: '#267dab', Os: '#266696',
  Ir: '#175487', Pt: '#d0d0e0', Au: '#ffd123', Hg: '#b8b8d0', Tl: '#a6544d', Pb: '#575961',
  Bi: '#9e4fb5', Th: '#00baff', U: '#008fff'
};

function elementSymbol(site: AtomSiteRow): string | null {
  const match = (site.type_symbol ?? site.site_label ?? '').match(/[A-Z][a-z]?/i);
  return match ? match[0][0].toUpperCase() + match[0].slice(1).toLowerCase() : null;
}

function elementColor(symbol: string): string {
  if (CPK_COLORS[symbol]) return CPK_COLORS[symbol];
  let hash = 0;
  for (const character of symbol) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return `hsl(${hash} 62% 52%)`;
}

interface Props {
  atomSites: AtomSiteRow[];
  mode: CrystalLegendMode;
  viewportWidth: number;
  onMeasured?: (mode: CrystalLegendMode, width: number, height: number) => void;
}

export default function CrystalLegend({ atomSites, mode, viewportWidth, onMeasured }: Props) {
  const legendRef = useRef<HTMLDivElement>(null);
  const elements = [...new Set(atomSites.map(elementSymbol).filter((value): value is string => value !== null))];
  const horizontalCapacity = Math.max(1, Math.floor((viewportWidth - 190) / 42));
  const visibleElements = mode === 'horizontal' ? elements.slice(0, horizontalCapacity) : elements;
  const hiddenElementCount = elements.length - visibleElements.length;

  useLayoutEffect(() => {
    const legend = legendRef.current;
    if (!legend || !onMeasured) return;
    const report = () => {
      const bounds = legend.getBoundingClientRect();
      onMeasured(mode, Math.ceil(bounds.width), Math.ceil(bounds.height));
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(legend);
    return () => observer.disconnect();
  }, [mode, onMeasured, viewportWidth, elements.join('|')]);

  if (mode === 'horizontal') {
    return (
      <div
        ref={legendRef}
        data-testid="crystal-legend"
        data-legend-mode="horizontal"
        className="flex min-h-7 w-full min-w-0 items-center gap-2 overflow-hidden rounded border border-white/30 bg-[#071018]/85 px-2 py-1.5 text-[10px] leading-tight text-white shadow"
        aria-label="Crystal viewer legend"
      >
        <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-[#c7d5e2]">Elements</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {visibleElements.map((symbol) => (
            <span key={symbol} className="flex shrink-0 items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border border-white/45" style={{ backgroundColor: elementColor(symbol) }} />
              {symbol}
            </span>
          ))}
          {hiddenElementCount > 0 && <span className="shrink-0 text-[#c7d5e2]">+{hiddenElementCount}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-white/25 pl-2 font-semibold">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-[#c7d5e2]">Axes</span>
          <span style={{ color: '#ff6666' }}>a →</span>
          <span style={{ color: '#66dc78' }}>b →</span>
          <span style={{ color: '#70adff' }}>c →</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={legendRef} data-testid="crystal-legend" data-legend-mode="vertical" className="ml-auto w-fit max-w-52 rounded border border-white/30 bg-[#071018]/85 px-2 py-1.5 text-[11px] leading-tight text-white shadow" aria-label="Crystal viewer legend">
      {elements.length > 0 && (
        <div className="mb-1.5">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[#c7d5e2]">Elements</div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {visibleElements.map((symbol) => (
              <span key={symbol} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full border border-white/45" style={{ backgroundColor: elementColor(symbol) }} />
                {symbol}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-white/25 pt-1">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[#c7d5e2]">Axes</div>
        <div className="flex items-center gap-2.5 font-semibold">
          <span style={{ color: '#ff6666' }}>a →</span>
          <span style={{ color: '#66dc78' }}>b →</span>
          <span style={{ color: '#70adff' }}>c →</span>
        </div>
      </div>
    </div>
  );
}
