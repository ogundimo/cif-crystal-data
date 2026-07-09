import React, { useEffect, useMemo, useState } from 'react';
import { GROUP_LABELS, PERIOD_LABELS, PERIODIC_TABLE, CATEGORY_CLASS, isPeriodicGap } from '../periodicTable';
import type { RestraintRow, SearchFilter } from '../../../shared/types';

const LEVEL_FULL = 'Complete structure determined';
const LEVEL_CELL = 'Cell parameters determined and structure type assigned';

interface Props {
  open: boolean;
  onClose: () => void;
  onSearch: (filter: SearchFilter) => void;
}

interface FormState {
  slot1: string[];
  slot2: string[];
  mode: 'AND' | 'OR';
  aMin: string;
  aMax: string;
  bMin: string;
  bMax: string;
  cMin: string;
  cMax: string;
  sgQuery: string;
  spaceGroupQuery: string;
  referenceQuery: string;
  level: string;
  elementCountQuery: string;
}

const emptyForm: FormState = {
  slot1: [],
  slot2: [],
  mode: 'AND',
  aMin: '',
  aMax: '',
  bMin: '',
  bMax: '',
  cMin: '',
  cMax: '',
  sgQuery: '',
  spaceGroupQuery: '',
  referenceQuery: '',
  level: '',
  elementCountQuery: ''
};

function toFilter(form: FormState): SearchFilter {
  const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
  return {
    slot1: form.slot1,
    slot2: form.slot2,
    mode: form.mode,
    aMin: num(form.aMin),
    aMax: num(form.aMax),
    bMin: num(form.bMin),
    bMax: num(form.bMax),
    cMin: num(form.cMin),
    cMax: num(form.cMax),
    sgQuery: form.sgQuery,
    spaceGroupQuery: form.spaceGroupQuery,
    referenceQuery: form.referenceQuery,
    level: form.level,
    elementCountQuery: form.elementCountQuery
  };
}

export default function QuickSearchDialog({ open, onClose, onSearch }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [restraints, setRestraints] = useState<RestraintRow[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    window.cifApi.restraints(toFilter(form)).then((rows) => {
      if (!cancelled) setRestraints(rows);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const columns = useMemo(() => {
    const max = Math.max(...PERIODIC_TABLE.map((e) => e.col));
    return max;
  }, []);

  const rows = useMemo(() => {
    const max = Math.max(...PERIODIC_TABLE.map((e) => e.row));
    return max;
  }, []);

  if (!open) return null;

  // Single source of truth for periodic-table cell highlighting: derived directly from the
  // current slot state on every render. There is no separate toggled boolean/class to drift.
  function slotOf(symbol: string): 1 | 2 | 0 {
    if (form.slot1.includes(symbol)) return 1;
    if (form.slot2.includes(symbol)) return 2;
    return 0;
  }

  function toggleElement(symbol: string, ctrl: boolean) {
    setForm((prev) => {
      const inSlot1 = prev.slot1.includes(symbol);
      const inSlot2 = prev.slot2.includes(symbol);
      // Clicking an already-selected element always removes it from whichever slot holds it.
      if (inSlot1) return { ...prev, slot1: prev.slot1.filter((s) => s !== symbol) };
      if (inSlot2) return { ...prev, slot2: prev.slot2.filter((s) => s !== symbol) };
      const target: 1 | 2 = ctrl || prev.slot1.length === 0 ? 1 : 2;
      const key = target === 1 ? 'slot1' : 'slot2';
      return { ...prev, [key]: [...prev[key], symbol] };
    });
  }

  function clearSlot(n: 1 | 2) {
    setForm((prev) => ({ ...prev, [n === 1 ? 'slot1' : 'slot2']: [] }));
  }

  function clearAll() {
    setForm(emptyForm);
  }

  function handleSearch() {
    onSearch(toFilter(form));
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[560px] w-[860px] max-w-[95vw] flex-col rounded-lg border border-stroke-strong bg-mica shadow-2xl">
        <div className="flex items-center gap-2 border-b border-stroke py-1.5 pl-3 pr-11 text-sm font-semibold">
          <span>Quick search</span>
        </div>
        <button
          className="absolute right-0 top-0 flex h-8 w-11 items-center justify-center rounded-tr-lg text-sm hover:bg-[#e81123] hover:text-white"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="flex flex-col gap-2 p-2.5">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${columns + 1}, 20px)`, gridAutoRows: '18px' }}
              >
                {GROUP_LABELS.map((g, i) => (
                  <div
                    key={`g-${i}`}
                    className="flex items-center justify-center text-[8px] font-semibold text-text-dim"
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                  >
                    {g}
                  </div>
                ))}
                {Object.entries(PERIOD_LABELS).map(([row, label]) => (
                  <div
                    key={`p-${row}`}
                    className="flex items-center justify-center text-[8px] font-semibold text-text-dim"
                    style={{ gridColumn: 1, gridRow: Number(row) + 1 }}
                  >
                    {label}
                  </div>
                ))}
                {Array.from({ length: rows }, (_, ri) => ri + 1).flatMap((r) =>
                  Array.from({ length: columns }, (_, ci) => ci + 1).map((c) => {
                    if (!isPeriodicGap(r, c)) return null;
                    return (
                      <div key={`gap-${r}-${c}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} />
                    );
                  })
                )}
                {PERIODIC_TABLE.map((el) => {
                  const slot = slotOf(el.symbol);
                  const selected = slot !== 0;
                  return (
                    <button
                      key={el.symbol}
                      type="button"
                      className={`relative -ml-px -mt-px flex select-none flex-col items-center justify-center border border-[#c9c9c9] text-[9px] font-bold leading-none hover:z-10 hover:outline hover:outline-2 hover:outline-accent ${
                        selected ? 'z-10 border-accent bg-accent text-white' : `bg-white ${CATEGORY_CLASS[el.category]}`
                      }`}
                      style={{ gridColumn: el.col + 1, gridRow: el.row + 1 }}
                      onClick={(e) => toggleElement(el.symbol, e.ctrlKey)}
                    >
                      <span
                        className={`absolute left-0.5 top-0 text-[6px] font-normal ${
                          selected ? 'text-white' : 'text-[#3a3a3a]'
                        }`}
                      >
                        {el.z}
                      </span>
                      {el.symbol}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 max-w-[440px] text-[9px] text-text-dim">
                Use Ctrl key to select multiple elements to be combined with OR.
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Element(s) 1:</label>
                <input className="input-w32" readOnly value={form.slot1.join(' OR ')} placeholder="click elements..." />
                <div className="flex gap-1 font-bold">
                  <button type="button" className="rounded px-1 hover:bg-[#e9e9e9]" onClick={() => clearSlot(1)}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Element(s) 2:</label>
                <input className="input-w32" readOnly value={form.slot2.join(' OR ')} />
                <div className="flex gap-1 font-bold">
                  <button type="button" className="rounded px-1 hover:bg-[#e9e9e9]" onClick={() => clearSlot(2)}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Combine elements:</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`btn-w32 px-3 ${form.mode === 'AND' ? 'btn-on' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, mode: 'AND' }))}
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    className={`btn-w32 px-3 ${form.mode === 'OR' ? 'btn-on' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, mode: 'OR' }))}
                  >
                    OR
                  </button>
                </div>
                <div />
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Number of elements:</label>
                <input
                  className="input-w32"
                  placeholder="e.g. 3 or 2-4"
                  value={form.elementCountQuery}
                  onChange={(e) => setForm((p) => ({ ...p, elementCountQuery: e.target.value }))}
                />
                <div />
              </div>

              <fieldset className="rounded-md border border-stroke bg-[#fafafa] px-2 py-1.5">
                <legend className="px-1.5 text-xs font-semibold text-accent">Cell lengths [nm]</legend>
                <div className="grid grid-cols-[auto_auto_auto_auto_auto_auto] items-center gap-x-2 gap-y-1">
                  <label>a:</label>
                  <span className="flex items-center gap-1">
                    <input
                      className="input-w32 w-14"
                      placeholder="min"
                      value={form.aMin}
                      onChange={(e) => setForm((p) => ({ ...p, aMin: e.target.value }))}
                    />
                    -
                    <input
                      className="input-w32 w-14"
                      placeholder="max"
                      value={form.aMax}
                      onChange={(e) => setForm((p) => ({ ...p, aMax: e.target.value }))}
                    />
                  </span>
                  <label>b:</label>
                  <span className="flex items-center gap-1">
                    <input
                      className="input-w32 w-14"
                      placeholder="min"
                      value={form.bMin}
                      onChange={(e) => setForm((p) => ({ ...p, bMin: e.target.value }))}
                    />
                    -
                    <input
                      className="input-w32 w-14"
                      placeholder="max"
                      value={form.bMax}
                      onChange={(e) => setForm((p) => ({ ...p, bMax: e.target.value }))}
                    />
                  </span>
                  <label>c:</label>
                  <span className="flex items-center gap-1">
                    <input
                      className="input-w32 w-14"
                      placeholder="min"
                      value={form.cMin}
                      onChange={(e) => setForm((p) => ({ ...p, cMin: e.target.value }))}
                    />
                    -
                    <input
                      className="input-w32 w-14"
                      placeholder="max"
                      value={form.cMax}
                      onChange={(e) => setForm((p) => ({ ...p, cMax: e.target.value }))}
                    />
                  </span>
                </div>
              </fieldset>

              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Space group number:</label>
                <input
                  className="input-w32"
                  placeholder="e.g. 62 or 60-70"
                  value={form.sgQuery}
                  onChange={(e) => setForm((p) => ({ ...p, sgQuery: e.target.value }))}
                />
                <div />
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Space group (H-M):</label>
                <input
                  className="input-w32"
                  placeholder="e.g. Pnma"
                  value={form.spaceGroupQuery}
                  onChange={(e) => setForm((p) => ({ ...p, spaceGroupQuery: e.target.value }))}
                />
                <div />
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Reference:</label>
                <input
                  className="input-w32"
                  placeholder="journal / year / volume..."
                  value={form.referenceQuery}
                  onChange={(e) => setForm((p) => ({ ...p, referenceQuery: e.target.value }))}
                />
                <div />
              </div>
              <div className="grid grid-cols-[130px_1fr_auto] items-center gap-1.5">
                <label>Level of struct. studies:</label>
                <select
                  className="input-w32"
                  value={form.level}
                  onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                >
                  <option value="">(any)</option>
                  <option value={LEVEL_FULL}>{LEVEL_FULL}</option>
                  <option value={LEVEL_CELL}>{LEVEL_CELL}</option>
                </select>
                <div />
              </div>
            </div>
          </div>

          <div className="h-[80px] overflow-auto rounded-md border border-stroke bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-44 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Field</th>
                  <th className="border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Content</th>
                  <th className="w-16 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Entries</th>
                </tr>
              </thead>
              <tbody>
                {restraints.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-1 text-gray-400">
                      No restraints defined
                    </td>
                  </tr>
                ) : (
                  restraints.map((r, i) => (
                    <tr key={i}>
                      <td className="border-b border-[#f0f0f0] px-2 py-1">{r.field}</td>
                      <td className="border-b border-[#f0f0f0] px-2 py-1">{r.content}</td>
                      <td className="border-b border-[#f0f0f0] px-2 py-1">{r.entries}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button className="btn-w32 btn-primary px-6" onClick={handleSearch}>
              Search!
            </button>
            <button className="btn-w32" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-w32" onClick={clearAll}>
              Clear all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
