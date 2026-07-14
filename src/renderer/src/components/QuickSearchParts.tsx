import React, { useMemo } from 'react';
import type { ElementSelection } from '../../../shared/types';
import { resolveElementSelection } from '../../../shared/periodicTableData';
import { CATEGORY_CLASS, GROUP_LABELS, PERIOD_LABELS, PERIODIC_TABLE } from '../periodicTable';

interface SearchFieldRowProps {
  label: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  message?: React.ReactNode;
}

export function SearchFieldRow({ label, htmlFor, children, action, message }: SearchFieldRowProps) {
  const labelNode = htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>;
  return (
    <div className="quick-search-field-row">
      {labelNode}
      <div className="min-w-0">{children}</div>
      <div className="quick-search-field-action">{action}</div>
      {message && <div className="quick-search-field-message">{message}</div>}
    </div>
  );
}

interface RangeInputRowProps {
  axis: 'a' | 'b' | 'c';
  min: string;
  max: string;
  inputClass: (field: `${'a' | 'b' | 'c'}${'Min' | 'Max'}`) => string;
  onChange: (bound: 'min' | 'max', value: string) => void;
  invalidMin: boolean;
  invalidMax: boolean;
  describedBy?: string;
}

export function RangeInputRow({
  axis,
  min,
  max,
  inputClass,
  onChange,
  invalidMin,
  invalidMax,
  describedBy
}: RangeInputRowProps) {
  const minField = `${axis}Min` as const;
  const maxField = `${axis}Max` as const;
  return (
    <div className="quick-search-range-row">
      <span className="quick-search-axis">{axis}:</span>
      <input
        className={inputClass(minField)}
        placeholder="min"
        aria-label={`Cell length ${axis} minimum`}
        value={min}
        onChange={(event) => onChange('min', event.target.value)}
        aria-invalid={invalidMin}
        aria-describedby={describedBy}
      />
      <span className="text-center text-text-dim">–</span>
      <input
        className={inputClass(maxField)}
        placeholder="max"
        aria-label={`Cell length ${axis} maximum`}
        value={max}
        onChange={(event) => onChange('max', event.target.value)}
        aria-invalid={invalidMax}
        aria-describedby={describedBy}
      />
    </div>
  );
}

interface PeriodicTablePickerProps {
  selection: ElementSelection;
  onChange: (selection: ElementSelection) => void;
  slotOf: (symbol: string) => 0 | 1 | 2 | 3 | 4;
  onToggleElement: (symbol: string) => void;
}

export function PeriodicTablePicker({ selection, onChange, slotOf, onToggleElement }: PeriodicTablePickerProps) {
  const resolved = useMemo(() => resolveElementSelection(selection), [selection]);
  const resolvedSet = useMemo(() => new Set(resolved), [resolved]);
  const toggleNumber = (key: 'groups' | 'periods', value: number) => onChange({
    ...selection,
    [key]: selection[key].includes(value)
      ? selection[key].filter((item) => item !== value)
      : [...selection[key], value].sort((a, b) => a - b)
  });

  return (
    <div className="quick-search-periodic-scroll">
      <div className="quick-search-periodic-wrap">
        <div className="quick-search-periodic-grid">
          {GROUP_LABELS.map((group, index) => (
            <button
              type="button"
              key={`group-${index}`}
              className={`quick-search-table-selector quick-search-group-selector ${selection.groups.includes(index + 1) ? 'quick-search-table-selector-selected' : ''}`}
              style={{ gridColumn: index + 2, gridRow: 1 }}
              onClick={() => toggleNumber('groups', index + 1)}
              aria-label={`Group ${index + 1}`}
              aria-pressed={selection.groups.includes(index + 1)}
            >
              {group}
            </button>
          ))}
          {Object.entries(PERIOD_LABELS).map(([row, label]) => (
            Number(row) <= 7 ? (
              <button
                type="button"
                key={`period-${row}`}
                className={`quick-search-table-selector quick-search-period-selector ${selection.periods.includes(Number(row)) ? 'quick-search-table-selector-selected' : ''}`}
                style={{ gridColumn: 1, gridRow: Number(row) + 1 }}
                onClick={() => toggleNumber('periods', Number(row))}
                aria-label={`Period ${row}`}
                aria-pressed={selection.periods.includes(Number(row))}
              >{label}</button>
            ) : <div key={`period-${row}`} className="quick-search-period-label" style={{ gridColumn: 1, gridRow: Number(row) + 1 }}>{label}</div>
          ))}
          {PERIODIC_TABLE.map((element) => {
            const explicit = slotOf(element.symbol) !== 0;
            const included = resolvedSet.has(element.symbol);
            return (
              <button
                key={element.symbol}
                type="button"
                className={`quick-search-element ${explicit ? 'quick-search-element-selected' : included ? 'quick-search-element-included' : CATEGORY_CLASS[element.category]}`}
                style={{ gridColumn: element.col + 1, gridRow: element.row + 1 }}
                onClick={() => onToggleElement(element.symbol)}
                aria-label={`${element.symbol}, atomic number ${element.z}${included && !explicit ? ', included by group or period' : ''}`}
                aria-pressed={explicit}
              >
                <span className="quick-search-atomic-number">{element.z}</span>
                {element.symbol}
              </button>
            );
          })}
        </div>
        <div className="quick-search-criteria-summary">
          <div className="quick-search-criteria-line">
            <span>Groups/periods:</span>
            {selection.groups.map((group) => <button type="button" key={`g-${group}`} onClick={() => toggleNumber('groups', group)} aria-label={`Remove Group ${group}`}>Group {group} ×</button>)}
            {selection.periods.map((period) => <button type="button" key={`p-${period}`} onClick={() => toggleNumber('periods', period)} aria-label={`Remove Period ${period}`}>Period {period} ×</button>)}
            {resolved.length === 0 && <em>None</em>}
          </div>
          <div className="quick-search-resolved-elements"><span>Group/period elements:</span> {resolved.join(', ') || 'None'}</div>
        </div>
        <p className="quick-search-periodic-help">Selections are added to the active element box. Top buttons select groups; left buttons select periods.</p>
      </div>
    </div>
  );
}
