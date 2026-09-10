import React, { useEffect, useRef, useState } from 'react';
import type { AtomSiteRow, EntryRow, PublAuthorRow } from '../../../shared/types';
import { usePanelSize, usePanePercentage } from '../layoutPreferences';
import JSmolViewer from './JSmolViewer';
import PxrdPattern from './PxrdPattern';
import PublicationReference from './PublicationReference';

interface Props {
  entry: EntryRow;
}

const DIVIDER_SIZE = 6;
const MIN_COLUMN_WIDTH = 220;
const MIN_VIEWER_ROW_HEIGHT = 44;
const MIN_LOWER_ROW_HEIGHT = 44;

export default function CompoundInfoPanel({ entry }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const viewerRowsRef = useRef<HTMLDivElement>(null);
  const columnDragStart = useRef<{ x: number; width: number } | null>(null);
  const rowDragStart = useRef<{ y: number; height: number } | null>(null);
  const [infoWidth, setInfoWidth] = usePanelSize('information-width', panelRef, MIN_COLUMN_WIDTH, 16 + DIVIDER_SIZE + MIN_COLUMN_WIDTH, 'width');
  const [viewerHeight, setViewerHeight] = usePanelSize('viewer-height', viewerRowsRef, MIN_VIEWER_ROW_HEIGHT, DIVIDER_SIZE + MIN_LOWER_ROW_HEIGHT, 'height');
  const infoPercentage = usePanePercentage(panelRef, '#information-pane', 'width');
  const viewerPercentage = usePanePercentage(viewerRowsRef, '[aria-label="Crystal structure viewer"]', 'height');
  const [atomSites, setAtomSites] = useState<AtomSiteRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [authors, setAuthors] = useState<PublAuthorRow[]>([]);
  const [authorStatus, setAuthorStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    setAtomSites([]);
    setStatus('loading');
    window.cifApi.getAtomSites(entry.id).then(
      (sites) => {
        if (!active) return;
        setAtomSites(sites);
        setStatus('ready');
      },
      () => {
        if (active) setStatus('error');
      }
    );
    return () => {
      active = false;
    };
  }, [entry.id]);

  useEffect(() => {
    let active = true;
    setAuthors([]);
    setAuthorStatus('loading');
    window.cifApi.getPublAuthors(entry.id).then(
      (rows) => {
        if (!active) return;
        setAuthors(rows);
        setAuthorStatus('ready');
      },
      () => {
        if (active) setAuthorStatus('error');
      }
    );
    return () => {
      active = false;
    };
  }, [entry.id]);

  const displayNumber = (value: number | null): string =>
    value === null ? '' : String(value);
  const metadata = [
    { label: 'Sample', value: entry.sample_type },
    { label: 'Color', value: entry.crystal_colour },
    {
      label: 'Unit-cell volume [Å³]',
      value: entry.cell_volume === null ? '' : String(Number(entry.cell_volume.toFixed(4)))
    }
  ];
  const publication = [
    { label: 'Reference', value: entry.reference },
    { label: 'Publication link', value: <PublicationReference entry={entry} authors={authors} /> },
    { label: 'Language', value: entry.journal_language }
  ];
  const cellParameters = [
    { label: 'α [°]', value: displayNumber(entry.cell_angle_alpha) },
    { label: 'β [°]', value: displayNumber(entry.cell_angle_beta) },
    { label: 'γ [°]', value: displayNumber(entry.cell_angle_gamma) }
  ];

  function resizeColumns(event: React.PointerEvent<HTMLDivElement>): void {
    if (!columnDragStart.current || !panelRef.current) return;
    const contentWidth = panelRef.current.clientWidth - 16;
    const maximum = Math.max(MIN_COLUMN_WIDTH, contentWidth - DIVIDER_SIZE - MIN_COLUMN_WIDTH);
    const nextWidth = columnDragStart.current.width + event.clientX - columnDragStart.current.x;
    setInfoWidth(Math.min(maximum, Math.max(MIN_COLUMN_WIDTH, nextWidth)));
  }

  function resizeViewerRows(event: React.PointerEvent<HTMLDivElement>): void {
    if (!rowDragStart.current || !viewerRowsRef.current) return;
    const maximum = Math.max(
      MIN_VIEWER_ROW_HEIGHT,
      viewerRowsRef.current.clientHeight - DIVIDER_SIZE - MIN_LOWER_ROW_HEIGHT
    );
    const nextHeight = rowDragStart.current.height + event.clientY - rowDragStart.current.y;
    setViewerHeight(Math.min(maximum, Math.max(MIN_VIEWER_ROW_HEIGHT, nextHeight)));
  }

  function finishColumnResize(event: React.PointerEvent<HTMLDivElement>): void {
    columnDragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function finishRowResize(event: React.PointerEvent<HTMLDivElement>): void {
    rowDragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div id="compound-pane" ref={panelRef} className="mb-2 flex h-[calc(100%_-_0.5rem)] min-w-0 px-2">
      <section
        id="information-pane"
        aria-label="Compound information"
        data-testid="compound-info-panel"
        className="min-w-0 flex-1 overflow-x-auto overflow-y-scroll border border-stroke bg-[#f1f3f5]"
        style={infoWidth === null ? undefined : { flex: `0 0 ${infoWidth}px` }}
      >        <table data-testid="compound-sample-metadata" className="w-full border-collapse border-b-2 border-[#b9c7d5] bg-white text-xs">
          <caption className="info-section-label">Sample details</caption>
          <tbody>
            {metadata.map((field) => (
              <tr key={field.label} data-info-field={field.label}>
                <th className="w-40 border-b border-r border-[#c8d2dc] bg-[#dfe8f1] px-2 py-1 text-left font-semibold text-[#2f4052]">
                  {field.label}
                </th>
                <td className="border-b border-[#d8dee5] bg-white px-2 py-1 font-medium text-[#202020]">{field.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table data-testid="cell-parameters-table" className="mt-1.5 w-full min-w-[15rem] border-collapse border-y-2 border-[#b9c7d5] bg-white text-xs">
          <caption className="info-section-label">Cell angles</caption>
          <thead>
            <tr>
              {cellParameters.map((field) => (
                <th
                  key={field.label}
                  className="border-b border-r border-[#c8d2dc] bg-[#dfe8f1] px-2 py-1 text-left font-semibold text-[#2f4052]"
                >
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cellParameters.map((field) => (
                <td key={field.label} className="border-b border-r border-[#d8dee5] bg-[#f8fafc] px-2 py-1 font-medium text-[#202020]">
                  {field.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <table data-testid="atom-sites-table" className="mt-1.5 w-full min-w-[34rem] border-collapse border-y-2 border-[#b9c7d5] bg-white text-xs">
          <caption className="info-section-label">Atomic sites</caption>
          <thead>
            <tr>
              {['Elements', 'Site', 'Wyck.', 'x', 'y', 'z', 'Occ.'].map((heading) => (
                <th
                  key={heading}
                  title={{ 'Wyck.': 'Wyckoff multiplicity and letter', 'Occ.': 'Site occupancy', x: 'Fractional coordinate x', y: 'Fractional coordinate y', z: 'Fractional coordinate z' }[heading] ?? heading}
                  className={`sticky top-0 z-[1] border-b border-r border-[#b9c7d5] bg-[#d7e3ee] px-2 py-1 text-left font-semibold text-[#26384a] ${['x', 'y', 'z'].includes(heading) ? 'italic' : ''}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {status === 'loading' ? (
              <tr><td colSpan={7} className="px-3 py-2 text-text-dim">Loading atomic sites…</td></tr>
            ) : status === 'error' ? (
              <tr><td colSpan={7} className="px-3 py-2 text-[#c42b1c]">Could not load atomic sites.</td></tr>
            ) : atomSites.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-2 text-text-dim">No atomic-site data available.</td></tr>
            ) : (
              atomSites.map((site, index) => (
                <tr key={site.id} className={index % 2 === 1 ? 'bg-[#f2f6fa]' : 'bg-white'}>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">{site.type_symbol}</td>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">{site.site_label}</td>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">
                    {site.symmetry_multiplicity ?? ''}<span className="italic">{site.wyckoff_symbol ?? ''}</span>
                  </td>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">{displayNumber(site.fract_x)}</td>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">{displayNumber(site.fract_y)}</td>
                  <td className="border-b border-r border-[#eeeeee] px-2 py-1">{displayNumber(site.fract_z)}</td>
                  <td className="border-b border-[#eeeeee] px-2 py-1">{displayNumber(site.occupancy)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <table data-testid="publication-table" className="mt-5 w-full min-w-[34rem] border-collapse border-y-2 border-[#b9c7d5] bg-white text-xs">
          <caption className="info-section-label">Publication</caption>
          <tbody>
            {publication.map((field) => (
              <tr key={field.label} data-info-field={field.label}>
                <th className="w-40 border-b border-r border-[#c8d2dc] bg-[#dfe8f1] px-2 py-1 text-left align-top font-semibold text-[#2f4052]">
                  {field.label}
                </th>
                <td className="border-b border-[#d8dee5] bg-white px-2 py-1 font-medium text-[#202020]">{field.value}</td>
              </tr>
            ))}
            <tr>
              <th className="w-40 border-b border-r border-[#c8d2dc] bg-[#dfe8f1] px-2 py-1 text-left align-top font-semibold text-[#2f4052]">
                Authors
              </th>
              <td className="border-b border-[#d8dee5] bg-white p-0 text-[#202020]">
                {authorStatus === 'loading' ? (
                  <span className="block px-2 py-1 text-text-dim">Loading authors…</span>
                ) : authorStatus === 'error' ? (
                  <span className="block px-2 py-1 text-[#c42b1c]">Could not load authors.</span>
                ) : authors.length === 0 ? (
                  <span className="block px-2 py-1 text-text-dim">No author data available.</span>
                ) : (
                  <table data-testid="publication-authors" className="w-full table-fixed border-collapse">
                    <thead>
                      <tr>
                        <th className="w-2/5 border-b border-r border-[#d8dee5] bg-[#edf2f6] px-2 py-1 text-left font-semibold text-[#2f4052]">
                          Name
                        </th>
                        <th className="border-b border-[#d8dee5] bg-[#edf2f6] px-2 py-1 text-left font-semibold text-[#2f4052]">
                          Organization / City
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {authors.map((author, index) => (
                        <tr key={author.id} className={index % 2 === 1 ? 'bg-[#f8fafc]' : 'bg-white'}>
                          <td className="border-b border-r border-[#eeeeee] px-2 py-1 align-top font-medium">
                            {author.name}
                          </td>
                          <td className="border-b border-[#eeeeee] px-2 py-1 align-top text-text-dim">
                            {author.address ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <div
        role="separator" data-resize-handle="true"
        aria-label="Resize compound information and visual panels"
        aria-orientation="vertical"
        aria-controls="information-pane"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={infoPercentage}
        tabIndex={0}
        title="Drag or use Left/Right arrows to resize · Enter or double-click to reset"
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); setInfoWidth(null); return; }
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !panelRef.current) return;
          event.preventDefault();
          const current = panelRef.current.querySelector('[data-testid="compound-info-panel"]')?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH;
          const maximum = Math.max(MIN_COLUMN_WIDTH, panelRef.current.clientWidth - 16 - DIVIDER_SIZE - MIN_COLUMN_WIDTH);
          setInfoWidth(Math.min(maximum, Math.max(MIN_COLUMN_WIDTH, current + (event.key === 'ArrowRight' ? 16 : -16))));
        }}
        onDoubleClick={() => {
          columnDragStart.current = null;
          setInfoWidth(null);
        }}
        className="w-1.5 shrink-0 cursor-col-resize touch-none select-none border-x border-[#d6d6d6] bg-[#eeeeee] hover:bg-[#dddddd]"
        onPointerDown={(event) => {
          const informationPanel = panelRef.current?.querySelector('[data-testid="compound-info-panel"]');
          columnDragStart.current = {
            x: event.clientX,
            width: informationPanel?.getBoundingClientRect().width ?? (panelRef.current?.clientWidth ?? 0) / 2
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={resizeColumns}
        onPointerUp={finishColumnResize}
        onPointerCancel={finishColumnResize}
      />
      <div
        ref={viewerRowsRef}
        className="grid min-w-0 flex-1"
        style={{
          gridTemplateRows: viewerHeight === null
            ? `minmax(${MIN_VIEWER_ROW_HEIGHT}px, 1fr) ${DIVIDER_SIZE}px minmax(${MIN_LOWER_ROW_HEIGHT}px, 1fr)`
            : `${viewerHeight}px ${DIVIDER_SIZE}px minmax(${MIN_LOWER_ROW_HEIGHT}px, 1fr)`
        }}
      >
        <JSmolViewer entry={entry} atomSites={atomSites} />
        <div
          role="separator" data-resize-handle="true"
          aria-label="Resize crystal viewer and lower visual panel"
          aria-orientation="horizontal"
          aria-controls="crystal-viewer-pane"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={viewerPercentage}
          tabIndex={0}
          title="Drag or use Up/Down arrows to resize · Enter or double-click to reset"
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); setViewerHeight(null); return; }
            if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !viewerRowsRef.current) return;
            event.preventDefault();
            const current = viewerRowsRef.current.querySelector('[aria-label="Crystal structure viewer"]')?.getBoundingClientRect().height ?? MIN_VIEWER_ROW_HEIGHT;
            const maximum = Math.max(MIN_VIEWER_ROW_HEIGHT, viewerRowsRef.current.clientHeight - DIVIDER_SIZE - MIN_LOWER_ROW_HEIGHT);
            setViewerHeight(Math.min(maximum, Math.max(MIN_VIEWER_ROW_HEIGHT, current + (event.key === 'ArrowDown' ? 16 : -16))));
          }}
          onDoubleClick={() => {
            rowDragStart.current = null;
            setViewerHeight(null);
          }}
          className="cursor-row-resize touch-none select-none border-y border-[#d6d6d6] bg-[#eeeeee] hover:bg-[#dddddd]"
          onPointerDown={(event) => {
            const viewer = viewerRowsRef.current?.querySelector('[aria-label="Crystal structure viewer"]');
            rowDragStart.current = {
              y: event.clientY,
              height: viewer?.getBoundingClientRect().height ?? (viewerRowsRef.current?.clientHeight ?? 0) / 2
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={resizeViewerRows}
          onPointerUp={finishRowResize}
          onPointerCancel={finishRowResize}
        />
        <PxrdPattern entry={entry} />
      </div>
    </div>
  );
}
