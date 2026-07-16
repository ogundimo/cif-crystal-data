import React, { useEffect, useState } from 'react';
import type { AtomSiteRow, EntryRow } from '../../../shared/types';

interface Props {
  entry: EntryRow;
}

export default function CompoundInfoPanel({ entry }: Props) {
  const [atomSites, setAtomSites] = useState<AtomSiteRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
  const cellParameters = [
    { label: 'a [Å]', value: (entry.cell_a * 10).toFixed(4) },
    { label: 'b [Å]', value: (entry.cell_b * 10).toFixed(4) },
    { label: 'c [Å]', value: (entry.cell_c * 10).toFixed(4) },
    { label: 'α [°]', value: displayNumber(entry.cell_angle_alpha) },
    { label: 'β [°]', value: displayNumber(entry.cell_angle_beta) },
    { label: 'γ [°]', value: displayNumber(entry.cell_angle_gamma) }
  ];

  return (
    <div className="mb-2 flex h-[calc(100%_-_0.5rem)] min-w-0 px-2">
      <section
        aria-label="Atomic sites"
        data-testid="compound-info-panel"
        className="w-1/2 min-w-0 overflow-x-auto overflow-y-scroll border border-stroke bg-[#f1f3f5]"
      >
        <table data-testid="compound-sample-metadata" className="w-full border-collapse bg-white text-xs">
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
        <table data-testid="cell-parameters-table" className="mt-1.5 w-full min-w-[30rem] border-collapse border-y-2 border-[#b9c7d5] bg-white text-xs">
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
        <table data-testid="atom-sites-table" className="mt-1.5 w-full min-w-[34rem] border-collapse border-t-2 border-[#b9c7d5] bg-white text-xs">
          <thead>
            <tr>
              {['Elements', 'Site', 'Wyck.', 'x', 'y', 'z', 'Occ.'].map((heading) => (
                <th
                  key={heading}
                  className="sticky top-0 z-[1] border-b border-r border-[#b9c7d5] bg-[#d7e3ee] px-2 py-1 text-left font-semibold text-[#26384a]"
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
                    {site.symmetry_multiplicity ?? ''}{site.wyckoff_symbol ?? ''}
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
      </section>
      <div className="w-1/2" aria-hidden="true" />
    </div>
  );
}
