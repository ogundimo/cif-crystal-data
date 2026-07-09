import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GROUP_LABELS, PERIOD_LABELS, PERIODIC_TABLE, CATEGORY_CLASS, isPeriodicGap } from '../periodicTable';
import type { RestraintRow, SearchFilter } from '../../../shared/types';
import { validateSearchInput, type SearchValidationField } from '../../../shared/searchValidation';
import { scheduleDebouncedRequest } from '../debouncedRequest';

const LEVEL_FULL = 'Complete structure determined';
const LEVEL_CELL = 'Cell parameters determined and structure type assigned';
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [appliedForm, setAppliedForm] = useState<FormState>(emptyForm);
  const [restraints, setRestraints] = useState<RestraintRow[]>([]);
  const [restraintsStatus, setRestraintsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [restraintsRetry, setRestraintsRetry] = useState(0);
  const validationErrors = useMemo(() => validateSearchInput(form), [form]);
  const isValid = Object.keys(validationErrors).length === 0;
  const discardAndClose = useCallback(() => {
    setForm(appliedForm);
    onClose();
  }, [appliedForm, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!isValid) {
      setRestraints([]);
      setRestraintsStatus('idle');
      return;
    }
    return scheduleDebouncedRequest({
      delay: 250,
      request: () => window.cifApi.restraints(toFilter(form)),
      onStart: () => setRestraintsStatus('loading'),
      onSuccess: (rows) => {
        setRestraints(rows);
        setRestraintsStatus('ready');
      },
      onError: () => {
        setRestraints([]);
        setRestraintsStatus('error');
      }
    });
  }, [form, isValid, open, restraintsRetry]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        discardAndClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const dialog = dialogRef.current;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (active === dialog || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [discardAndClose, open]);

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
    if (!isValid) return;
    setAppliedForm(form);
    onSearch(toFilter(form));
    onClose();
  }

  function inputClass(field: SearchValidationField): string {
    return `input-w32 ${validationErrors[field] ? 'border-red-600 border-b-red-600' : ''}`;
  }

  const cellLengthError =
    validationErrors.aMin ??
    validationErrors.aMax ??
    validationErrors.bMin ??
    validationErrors.bMax ??
    validationErrors.cMin ??
    validationErrors.cMax;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) discardAndClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-search-title"
        tabIndex={-1}
        className="relative flex w-[1040px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-stroke-strong bg-mica shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-stroke py-1.5 pl-3 pr-11 text-sm font-semibold">
          <span id="quick-search-title">Quick search</span>
        </div>
        <button
          type="button"
          className="absolute right-0 top-0 flex h-8 w-11 items-center justify-center rounded-tr-lg text-sm hover:bg-[#e81123] hover:text-white"
          onClick={discardAndClose}
          aria-label="Close"
        >
          ✕
        </button>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSearch();
            }
          }}
        >
        <div className="p-2.5">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[380px_minmax(0,1fr)] gap-3">
            <div className="min-w-0">
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
                      aria-label={`${el.symbol}, atomic number ${el.z}`}
                      aria-pressed={selected}
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

            <div className="flex min-w-0 flex-col gap-1">
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-elements-1">Element(s) 1:</label>
                <input id="quick-search-elements-1" className="input-w32" readOnly value={form.slot1.join(' OR ')} placeholder="click elements..." />
                <div className="flex gap-1 font-bold">
                  <button
                    type="button"
                    className="rounded px-1 hover:bg-[#e9e9e9]"
                    onClick={() => clearSlot(1)}
                    aria-label="Clear element group 1"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-elements-2">Element(s) 2:</label>
                <input id="quick-search-elements-2" className="input-w32" readOnly value={form.slot2.join(' OR ')} />
                <div className="flex gap-1 font-bold">
                  <button
                    type="button"
                    className="rounded px-1 hover:bg-[#e9e9e9]"
                    onClick={() => clearSlot(2)}
                    aria-label="Clear element group 2"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <span id="quick-search-combine-label">Combine elements:</span>
                <div className="flex items-center gap-1" role="group" aria-labelledby="quick-search-combine-label">
                  <button
                    type="button"
                    className={`btn-w32 px-3 ${form.mode === 'AND' ? 'btn-on' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, mode: 'AND' }))}
                    aria-pressed={form.mode === 'AND'}
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    className={`btn-w32 px-3 ${form.mode === 'OR' ? 'btn-on' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, mode: 'OR' }))}
                    aria-pressed={form.mode === 'OR'}
                  >
                    OR
                  </button>
                </div>
                <div />
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-element-count">Number of elements:</label>
                <input
                  id="quick-search-element-count"
                  className={inputClass('elementCountQuery')}
                  placeholder="e.g. 3 or 2-4"
                  value={form.elementCountQuery}
                  onChange={(e) => setForm((p) => ({ ...p, elementCountQuery: e.target.value }))}
                  aria-invalid={Boolean(validationErrors.elementCountQuery)}
                  aria-describedby={validationErrors.elementCountQuery ? 'element-count-error' : undefined}
                />
                <div />
                {validationErrors.elementCountQuery && (
                  <p id="element-count-error" className="col-span-2 col-start-2 text-[10px] leading-tight text-red-700">
                    {validationErrors.elementCountQuery}
                  </p>
                )}
              </div>

              <fieldset className="rounded-md border border-stroke bg-[#fafafa] px-2 py-1.5">
                <legend className="px-1.5 text-xs font-semibold text-accent">Cell lengths [nm]</legend>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="flex min-w-[170px] flex-1 items-center gap-2">
                    <label>a:</label>
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                      <input
                        className={inputClass('aMin')}
                        placeholder="min"
                        aria-label="Cell length a minimum"
                        value={form.aMin}
                        onChange={(e) => setForm((p) => ({ ...p, aMin: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.aMin)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                      -
                      <input
                        className={inputClass('aMax')}
                        placeholder="max"
                        aria-label="Cell length a maximum"
                        value={form.aMax}
                        onChange={(e) => setForm((p) => ({ ...p, aMax: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.aMax)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                    </div>
                  </div>
                  <div className="flex min-w-[170px] flex-1 items-center gap-2">
                    <label>b:</label>
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                      <input
                        className={inputClass('bMin')}
                        placeholder="min"
                        aria-label="Cell length b minimum"
                        value={form.bMin}
                        onChange={(e) => setForm((p) => ({ ...p, bMin: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.bMin)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                      -
                      <input
                        className={inputClass('bMax')}
                        placeholder="max"
                        aria-label="Cell length b maximum"
                        value={form.bMax}
                        onChange={(e) => setForm((p) => ({ ...p, bMax: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.bMax)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                    </div>
                  </div>
                  <div className="flex min-w-[170px] flex-1 items-center gap-2">
                    <label>c:</label>
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
                      <input
                        className={inputClass('cMin')}
                        placeholder="min"
                        aria-label="Cell length c minimum"
                        value={form.cMin}
                        onChange={(e) => setForm((p) => ({ ...p, cMin: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.cMin)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                      -
                      <input
                        className={inputClass('cMax')}
                        placeholder="max"
                        aria-label="Cell length c maximum"
                        value={form.cMax}
                        onChange={(e) => setForm((p) => ({ ...p, cMax: e.target.value }))}
                        aria-invalid={Boolean(validationErrors.cMax)}
                        aria-describedby={cellLengthError ? 'cell-length-error' : undefined}
                      />
                    </div>
                  </div>
                  {cellLengthError && (
                    <p id="cell-length-error" className="basis-full text-[10px] leading-tight text-red-700">
                      {cellLengthError}
                    </p>
                  )}
                </div>
              </fieldset>

              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-space-group-number">Space group number:</label>
                <input
                  id="quick-search-space-group-number"
                  className={inputClass('sgQuery')}
                  placeholder="e.g. 62 or 60-70"
                  value={form.sgQuery}
                  onChange={(e) => setForm((p) => ({ ...p, sgQuery: e.target.value }))}
                  aria-invalid={Boolean(validationErrors.sgQuery)}
                  aria-describedby={validationErrors.sgQuery ? 'space-group-number-error' : undefined}
                />
                <div />
                {validationErrors.sgQuery && (
                  <p id="space-group-number-error" className="col-span-2 col-start-2 text-[10px] leading-tight text-red-700">
                    {validationErrors.sgQuery}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-space-group-hm">Space group (H-M):</label>
                <input
                  id="quick-search-space-group-hm"
                  className="input-w32"
                  placeholder="e.g. Pnma"
                  value={form.spaceGroupQuery}
                  onChange={(e) => setForm((p) => ({ ...p, spaceGroupQuery: e.target.value }))}
                />
                <div />
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-reference">Reference:</label>
                <input
                  id="quick-search-reference"
                  className="input-w32"
                  placeholder="journal / year / volume..."
                  value={form.referenceQuery}
                  onChange={(e) => setForm((p) => ({ ...p, referenceQuery: e.target.value }))}
                />
                <div />
              </div>
              <div className="grid grid-cols-[130px_minmax(0,1fr)_20px] items-center gap-1.5">
                <label htmlFor="quick-search-study-level">Level of struct. studies:</label>
                <select
                  id="quick-search-study-level"
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

            <div className="h-[120px] overflow-auto rounded-md border border-stroke bg-white" aria-live="polite">
              <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-44 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Field</th>
                  <th className="border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Content</th>
                  <th className="w-16 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left font-semibold">Entries</th>
                </tr>
              </thead>
              <tbody>
                {!isValid ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-1 text-red-700">
                      Correct the invalid search values to preview matching entries.
                    </td>
                  </tr>
                ) : restraintsStatus === 'loading' ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-1 text-text-dim">
                      Updating preview…
                    </td>
                  </tr>
                ) : restraintsStatus === 'error' ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-1 text-red-700">
                      Could not update the preview.
                      <button
                        type="button"
                        className="ml-2 font-semibold text-accent hover:underline"
                        onClick={() => setRestraintsRetry((value) => value + 1)}
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : restraints.length === 0 ? (
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
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stroke p-2.5">
          <button type="submit" className="btn-w32 btn-primary px-6 disabled:cursor-not-allowed disabled:opacity-50" disabled={!isValid}>
            Search!
          </button>
          <button type="button" className="btn-w32" onClick={discardAndClose}>
            Cancel
          </button>
          <button type="button" className="btn-w32" onClick={clearAll}>
            Clear all
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
