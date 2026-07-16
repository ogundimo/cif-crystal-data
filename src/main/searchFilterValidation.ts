import { ELEMENT_SYMBOLS, SELECTABLE_PERIODS } from '../shared/periodicTableData';
import type { ElementSelection, SearchFilter } from '../shared/types';

const ELEMENT_SET = new Set<string>(ELEMENT_SYMBOLS);
const PERIOD_SET = new Set<number>(SELECTABLE_PERIODS);
const MAX_ELEMENT_CRITERIA = ELEMENT_SYMBOLS.length;
const MAX_TEXT_LENGTH = 200;

function fail(message: string): never {
  throw new TypeError(`Invalid search filter: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateElements(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  if (value.length > MAX_ELEMENT_CRITERIA) fail(`${field} contains too many elements`);
  for (const item of value) {
    if (typeof item !== 'string' || !ELEMENT_SET.has(item)) {
      fail(`${field} contains an invalid element symbol`);
    }
  }
  return value as string[];
}

function validateBoundedIntegers(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  if (value.length > maximum - minimum + 1) fail(`${field} contains too many values`);
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < minimum || item > maximum) {
      fail(`${field} contains an out-of-range value`);
    }
  }
  return value as number[];
}

function validateSelection(value: unknown, field: string): ElementSelection {
  if (!isRecord(value)) fail(`${field} must be an object`);
  if (value.exclude !== undefined && typeof value.exclude !== 'boolean') {
    fail(`${field}.exclude must be a boolean`);
  }
  const periods = value.periods;
  if (!Array.isArray(periods)) fail(`${field}.periods must be an array`);
  if (periods.length > PERIOD_SET.size) fail(`${field}.periods contains too many values`);
  for (const period of periods) {
    if (typeof period !== 'number' || !Number.isInteger(period) || !PERIOD_SET.has(period)) {
      fail(`${field}.periods contains an invalid period`);
    }
  }
  return {
    elements: validateElements(value.elements, `${field}.elements`),
    groups: validateBoundedIntegers(value.groups, `${field}.groups`, 1, 18),
    periods: periods as number[],
    exclude: value.exclude as boolean | undefined
  };
}

/** Validate the untrusted value received over IPC before database code sees it. */
export function validateSearchFilter(value: unknown): SearchFilter {
  if (!isRecord(value)) fail('payload must be an object');

  validateElements(value.slot1, 'slot1');
  validateElements(value.slot2, 'slot2');
  for (const field of ['slot3', 'slot4'] as const) {
    if (value[field] !== undefined) validateElements(value[field], field);
  }

  if (value.mode !== 'AND' && value.mode !== 'OR') fail('mode must be AND or OR');

  if (value.elementSelections !== undefined) {
    if (!Array.isArray(value.elementSelections) || value.elementSelections.length > 4) {
      fail('elementSelections must contain at most four selections');
    }
    value.elementSelections.forEach((selection, index) =>
      validateSelection(selection, `elementSelections[${index}]`)
    );
  }
  if (value.elementSelection !== undefined) validateSelection(value.elementSelection, 'elementSelection');

  for (const field of ['aMin', 'aMax', 'bMin', 'bMax', 'cMin', 'cMax'] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (typeof candidate !== 'number' || !Number.isFinite(candidate))) {
      fail(`${field} must be a finite number`);
    }
  }

  for (const field of [
    'sgQuery',
    'spaceGroupQuery',
    'referenceQuery',
    'level',
    'elementCountQuery'
  ] as const) {
    const candidate = value[field];
    if (
      candidate !== undefined &&
      (typeof candidate !== 'string' || candidate.length > MAX_TEXT_LENGTH)
    ) {
      fail(`${field} must be a string of at most ${MAX_TEXT_LENGTH} characters`);
    }
  }

  for (const field of [
    'sgExclude',
    'spaceGroupExclude',
    'referenceExclude',
    'elementCountExclude'
  ] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== 'boolean') {
      fail(`${field} must be a boolean`);
    }
  }

  return value as unknown as SearchFilter;
}
