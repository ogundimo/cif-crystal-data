import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LEVEL_CELL, LEVEL_FULL, type ElementSelection, type ElementSelections, type RestraintRow, type SearchFilter } from '../../../shared/types';
import { createEmptyElementSelection, formatElementSelection, toggleElementCriterion } from '../../../shared/periodicTableData';
import { validateSearchInput, type SearchValidationField } from '../../../shared/searchValidation';
import { scheduleDebouncedRequest } from '../debouncedRequest';
import { PeriodicTablePicker, RangeInputRow, SearchFieldRow } from './QuickSearchParts';
import closeIcon from '../../../../icons/close ICON.png';
import notEqualIcon from '../../../../icons/not-equal.png';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  onSearch: (filter: SearchFilter) => void;
  resetSignal?: number;
}

function NegatableInput({ excluded, children }: { excluded: boolean; children: React.ReactNode }) {
  return (
    <div className={`quick-search-negatable-input ${excluded ? 'quick-search-negatable-input-active' : ''}`}>
      {excluded && <span className="quick-search-not-prefix">NOT('</span>}
      {children}
      {excluded && <span className="quick-search-not-suffix">')</span>}
    </div>
  );
}

interface FormState {
  elementSelections: ElementSelections;
  aMin: string;
  aMax: string;
  bMin: string;
  bMax: string;
  cMin: string;
  cMax: string;
  sgQuery: string;
  sgExclude: boolean;
  spaceGroupQuery: string;
  spaceGroupExclude: boolean;
  referenceQuery: string;
  referenceExclude: boolean;
  level: string;
  elementCountQuery: string;
  elementCountExclude: boolean;
}

const emptyForm: FormState = {
  elementSelections: [
    createEmptyElementSelection(),
    createEmptyElementSelection(),
    createEmptyElementSelection(),
    createEmptyElementSelection()
  ],
  aMin: '',
  aMax: '',
  bMin: '',
  bMax: '',
  cMin: '',
  cMax: '',
  sgQuery: '',
  sgExclude: false,
  spaceGroupQuery: '',
  spaceGroupExclude: false,
  referenceQuery: '',
  referenceExclude: false,
  level: '',
  elementCountQuery: '',
  elementCountExclude: false
};

function toFilter(form: FormState): SearchFilter {
  const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s));
  return {
    slot1: form.elementSelections[0].elements,
    slot2: form.elementSelections[1].elements,
    slot3: form.elementSelections[2].elements,
    slot4: form.elementSelections[3].elements,
    mode: 'AND',
    elementSelections: form.elementSelections,
    aMin: num(form.aMin),
    aMax: num(form.aMax),
    bMin: num(form.bMin),
    bMax: num(form.bMax),
    cMin: num(form.cMin),
    cMax: num(form.cMax),
    sgQuery: form.sgQuery,
    sgExclude: form.sgExclude,
    spaceGroupQuery: form.spaceGroupQuery,
    spaceGroupExclude: form.spaceGroupExclude,
    referenceQuery: form.referenceQuery,
    referenceExclude: form.referenceExclude,
    level: form.level,
    elementCountQuery: form.elementCountQuery,
    elementCountExclude: form.elementCountExclude
  };
}

function hasSearchCriteria(form: FormState): boolean {
  return (
    form.elementSelections.some(
      (selection) => selection.elements.length || selection.groups.length || selection.periods.length
    ) ||
    [
      form.aMin,
      form.aMax,
      form.bMin,
      form.bMax,
      form.cMin,
      form.cMax,
      form.sgQuery,
      form.spaceGroupQuery,
      form.referenceQuery,
      form.level,
      form.elementCountQuery
    ].some((value) => value.trim().length > 0)
  );
}

export default function QuickSearchDialog({ open, onClose, onSearch, resetSignal }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [appliedForm, setAppliedForm] = useState<FormState>(emptyForm);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | 3 | 4>(1);
  const [restraints, setRestraints] = useState<RestraintRow[]>([]);
  const [restraintsStatus, setRestraintsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [restraintsRetry, setRestraintsRetry] = useState(0);
  const validationErrors = useMemo(() => validateSearchInput(form), [form]);
  const isValid = Object.keys(validationErrors).length === 0;
  const hasCriteria = hasSearchCriteria(form);
  const discardAndClose = useCallback(() => {
    setForm(appliedForm);
    onClose();
  }, [appliedForm, onClose]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setForm(emptyForm);
    setAppliedForm(emptyForm);
    setActiveSlot(1);
    setRestraints([]);
    setRestraintsStatus('idle');
  }, [resetSignal]);

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

  if (!open) return null;

  function slotOf(symbol: string): 1 | 2 | 3 | 4 | 0 {
    const index = form.elementSelections.findIndex((selection) =>
      selection.elements.includes(symbol)
    );
    return index === -1 ? 0 : ((index + 1) as 1 | 2 | 3 | 4);
  }

  function updateSelection(slot: 1 | 2 | 3 | 4, update: (selection: ElementSelection) => ElementSelection) {
    setForm((previous) => {
      const elementSelections = [...previous.elementSelections] as ElementSelections;
      elementSelections[slot - 1] = update(elementSelections[slot - 1]);
      return { ...previous, elementSelections };
    });
  }

  function toggleElement(symbol: string) {
    const targetSlot = activeSlot;
    const existingSlot = slotOf(symbol);
    updateSelection(existingSlot || targetSlot, (selection) =>
      toggleElementCriterion(selection, symbol)
    );
    setActiveSlot(targetSlot === 4 ? 1 : ((targetSlot + 1) as 1 | 2 | 3 | 4));
  }

  function clearSlot(slot: 1 | 2 | 3 | 4) {
    setActiveSlot(slot);
    updateSelection(slot, createEmptyElementSelection);
  }

  function toggleNotEqual(slot: 1 | 2 | 3 | 4) {
    setActiveSlot(slot);
    updateSelection(slot, (selection) => ({
      ...selection,
      exclude: !selection.exclude
    }));
  }

  type NegatableField =
    | 'elementCountQuery'
    | 'sgQuery'
    | 'spaceGroupQuery'
    | 'referenceQuery';
  type ExcludeField =
    | 'elementCountExclude'
    | 'sgExclude'
    | 'spaceGroupExclude'
    | 'referenceExclude';

  const excludeFieldFor: Record<NegatableField, ExcludeField> = {
    elementCountQuery: 'elementCountExclude',
    sgQuery: 'sgExclude',
    spaceGroupQuery: 'spaceGroupExclude',
    referenceQuery: 'referenceExclude'
  };

  function toggleFieldNotEqual(field: NegatableField) {
    const excludeField = excludeFieldFor[field];
    setForm((previous) => ({
      ...previous,
      [excludeField]: !previous[excludeField]
    }));
  }

  function clearField(field: NegatableField) {
    const excludeField = excludeFieldFor[field];
    setForm((previous) => ({
      ...previous,
      [field]: '',
      [excludeField]: false
    } as FormState));
  }

  function fieldActions(field: NegatableField, label: string) {
    const excludeField = excludeFieldFor[field];
    return (
      <>
        <button
          type="button"
          className={`quick-search-ne ${form[excludeField] ? 'quick-search-ne-active' : ''}`}
          onClick={() => toggleFieldNotEqual(field)}
          aria-label={`Not equal ${label}`}
          aria-pressed={form[excludeField]}
          title={`Exclude matches for ${label}`}
        >
          <img className="quick-search-ne-icon" src={notEqualIcon} alt="" />
        </button>
        <button
          type="button"
          className="quick-search-clear"
          onClick={() => clearField(field)}
          aria-label={`Clear ${label}`}
        >
          <img className="h-3 w-3 object-contain" src={closeIcon} alt="" />
        </button>
      </>
    );
  }

  function clearAll() {
    setForm(emptyForm);
    setActiveSlot(1);
  }

  function handleSearch() {
    if (!isValid || !hasCriteria) return;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-[1px]"
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
        className="quick-search-dialog"
      >
        <div className="quick-search-titlebar">
          <span id="quick-search-title">Quick search</span>
        </div>
        <button
          type="button"
          className="quick-search-close"
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
        <div className="quick-search-content">
          <div className="flex flex-col gap-2">
            <div className="quick-search-main-grid">
            <PeriodicTablePicker
              selection={form.elementSelections[activeSlot - 1]}
              onChange={(selection) => updateSelection(activeSlot, () => selection)}
              slotOf={slotOf}
              onToggleElement={toggleElement}
            />

            <div className="quick-search-fields">
              <span className="quick-search-elements-heading">Element(s)</span>
              <div className="quick-search-element-groups">
                {([1, 3, 2, 4] as const).map((slot) => (
                  <SearchFieldRow
                    key={slot}
                    label="AND:"
                    htmlFor={`quick-search-elements-${slot}`}
                    action={
                      <>
                        <button
                          type="button"
                          className={`quick-search-ne ${form.elementSelections[slot - 1].exclude ? 'quick-search-ne-active' : ''}`}
                          onClick={() => toggleNotEqual(slot)}
                          aria-label={`Not equal element group ${slot}`}
                          aria-pressed={Boolean(form.elementSelections[slot - 1].exclude)}
                          title="Exclude entries containing this element selection"
                        >
                          <img className="quick-search-ne-icon" src={notEqualIcon} alt="" />
                        </button>
                        <button
                          type="button"
                          className="quick-search-clear"
                          onClick={() => clearSlot(slot)}
                          aria-label={`Clear element group ${slot}`}
                        >
                          <img className="h-3 w-3 object-contain" src={closeIcon} alt="" />
                        </button>
                      </>
                    }
                  >
                    <input
                      id={`quick-search-elements-${slot}`}
                      className={`input-w32 ${activeSlot === slot ? 'quick-search-element-field-active' : ''}`}
                      readOnly
                      value={formatElementSelection(form.elementSelections[slot - 1])}
                      placeholder={slot === 1 ? 'click elements...' : undefined}
                      onFocus={() => setActiveSlot(slot)}
                      onClick={() => setActiveSlot(slot)}
                      aria-label={`Element criterion ${slot}`}
                      aria-current={activeSlot === slot ? 'true' : undefined}
                    />
                  </SearchFieldRow>
                ))}
              </div>
              <SearchFieldRow
                label="Number of elements:"
                htmlFor="quick-search-element-count"
                action={fieldActions('elementCountQuery', 'number of elements')}
                message={validationErrors.elementCountQuery && <span id="element-count-error">{validationErrors.elementCountQuery}</span>}
              >
                <NegatableInput excluded={form.elementCountExclude}>
                  <input
                    id="quick-search-element-count"
                    className={inputClass('elementCountQuery')}
                    placeholder="e.g. 3 or 2-4"
                    value={form.elementCountQuery}
                    onChange={(e) => setForm((p) => ({ ...p, elementCountQuery: e.target.value }))}
                    aria-invalid={Boolean(validationErrors.elementCountQuery)}
                    aria-describedby={validationErrors.elementCountQuery ? 'element-count-error' : undefined}
                  />
                </NegatableInput>
              </SearchFieldRow>

              <SearchFieldRow
                label="Space group number:"
                htmlFor="quick-search-space-group-number"
                action={fieldActions('sgQuery', 'space group number')}
                message={validationErrors.sgQuery && <span id="space-group-number-error">{validationErrors.sgQuery}</span>}
              >
                <NegatableInput excluded={form.sgExclude}>
                  <input
                    id="quick-search-space-group-number"
                    className={inputClass('sgQuery')}
                    placeholder="e.g. 62 or 60-70"
                    value={form.sgQuery}
                    onChange={(e) => setForm((p) => ({ ...p, sgQuery: e.target.value }))}
                    aria-invalid={Boolean(validationErrors.sgQuery)}
                    aria-describedby={validationErrors.sgQuery ? 'space-group-number-error' : undefined}
                  />
                </NegatableInput>
              </SearchFieldRow>
              <SearchFieldRow
                label="Space group (H-M):"
                htmlFor="quick-search-space-group-hm"
                action={fieldActions('spaceGroupQuery', 'space group')}
              >
                <NegatableInput excluded={form.spaceGroupExclude}>
                  <input
                    id="quick-search-space-group-hm"
                    className="input-w32"
                    placeholder="e.g. Pnma"
                    value={form.spaceGroupQuery}
                    onChange={(e) => setForm((p) => ({ ...p, spaceGroupQuery: e.target.value }))}
                  />
                </NegatableInput>
              </SearchFieldRow>
              <SearchFieldRow
                label="Reference:"
                htmlFor="quick-search-reference"
                action={fieldActions('referenceQuery', 'reference')}
              >
                <NegatableInput excluded={form.referenceExclude}>
                  <input
                    id="quick-search-reference"
                    className="input-w32"
                    placeholder="journal / year / volume..."
                    value={form.referenceQuery}
                    onChange={(e) => setForm((p) => ({ ...p, referenceQuery: e.target.value }))}
                  />
                </NegatableInput>
              </SearchFieldRow>
              <SearchFieldRow label="Level of struct. studies:" htmlFor="quick-search-study-level">
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
              </SearchFieldRow>

              <fieldset className="quick-search-range-group">
                <legend>Cell lengths [Å]</legend>
                <div className="quick-search-ranges">
                  {(['a', 'b', 'c'] as const).map((axis) => (
                    <RangeInputRow
                      key={axis}
                      axis={axis}
                      min={form[`${axis}Min`]}
                      max={form[`${axis}Max`]}
                      inputClass={inputClass}
                      onChange={(bound, value) =>
                        setForm((previous) => ({ ...previous, [`${axis}${bound === 'min' ? 'Min' : 'Max'}`]: value }))
                      }
                      invalidMin={Boolean(validationErrors[`${axis}Min`])}
                      invalidMax={Boolean(validationErrors[`${axis}Max`])}
                      describedBy={cellLengthError ? 'cell-length-error' : undefined}
                    />
                  ))}
                  {cellLengthError && (
                    <p id="cell-length-error" className="quick-search-range-error">
                      {cellLengthError}
                    </p>
                  )}
                </div>
              </fieldset>
            </div>
          </div>

            <div className="quick-search-preview" aria-live="polite">
              <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-44 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Field</th>
                  <th className="border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Content</th>
                  <th className="w-16 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Entries</th>
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
                      <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.field}</td>
                      <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.content}</td>
                      <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.entries}</td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="quick-search-footer">
          <button type="submit" className="btn-w32 btn-primary min-w-[74px] disabled:cursor-not-allowed disabled:opacity-50" disabled={!isValid || !hasCriteria}>
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
