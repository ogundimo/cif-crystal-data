import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { LEVEL_CELL, LEVEL_FULL, type ElementSelection, type ElementSelections } from '../../../shared/types';
import { createEmptyElementSelection, formatElementSelection, toggleElementCriterion } from '../../../shared/periodicTableData';
import type { validateSearchInput, SearchValidationField } from '../../../shared/searchValidation';
import { PeriodicTablePicker, RangeInputRow, SearchFieldRow } from './QuickSearchParts';
import type { FormState } from './quickSearchForm';
import closeIcon from '../../../../icons/close ICON.png';

function NegatableInput({ excluded, children }: { excluded: boolean; children: ReactNode }) {
  return (
    <div className={`quick-search-negatable-input ${excluded ? 'quick-search-negatable-input-active' : ''}`}>
      {excluded && <span className="quick-search-not-prefix">NOT('</span>}
      {children}
      {excluded && <span className="quick-search-not-suffix">')</span>}
    </div>
  );
}

interface Props {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  activeSlot: 1 | 2 | 3 | 4;
  setActiveSlot: Dispatch<SetStateAction<1 | 2 | 3 | 4>>;
  validationErrors: ReturnType<typeof validateSearchInput>;
}

export function QuickSearchFields({ form, setForm, activeSlot, setActiveSlot, validationErrors }: Props) {
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
          <span className="quick-search-ne-icon" aria-hidden="true">≠</span>
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
    <>
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
                    <span className="quick-search-ne-icon" aria-hidden="true">≠</span>
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
    </>
  );
}
