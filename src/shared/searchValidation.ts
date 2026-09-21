export interface SearchValidationInput {
  aMin: string;
  aMax: string;
  bMin: string;
  bMax: string;
  cMin: string;
  cMax: string;
  sgQuery: string;
  elementCountQuery: string;
}

export type SearchValidationField = keyof SearchValidationInput;
type SearchValidationErrors = Partial<Record<SearchValidationField, string>>;

function validatePositiveNumber(
  value: string,
  field: SearchValidationField,
  errors: SearchValidationErrors
): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors[field] = 'Enter a number greater than 0.';
    return undefined;
  }
  return parsed;
}

function validateIntegerOrRange(
  value: string,
  field: SearchValidationField,
  label: string,
  maximum: number,
  errors: SearchValidationErrors
): void {
  const trimmed = value.trim();
  if (trimmed === '') return;

  const match = trimmed.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) {
    errors[field] = `Enter ${label} as an integer or range (for example, 3 or 2-4).`;
    return;
  }

  const lower = Number(match[1]);
  const upper = match[2] === undefined ? lower : Number(match[2]);
  if (lower < 1 || upper > maximum) {
    errors[field] = `Enter a value from 1 to ${maximum}.`;
  } else if (lower > upper) {
    errors[field] = 'Range minimum cannot exceed its maximum.';
  }
}

export function validateNumericSearchInput(
  input: Pick<SearchValidationInput, 'sgQuery' | 'elementCountQuery'>
): SearchValidationErrors {
  const errors: SearchValidationErrors = {};
  validateIntegerOrRange(input.sgQuery, 'sgQuery', 'a space-group number', 230, errors);
  validateIntegerOrRange(input.elementCountQuery, 'elementCountQuery', 'an element count', 118, errors);
  return errors;
}

export function validateSearchInput(input: SearchValidationInput): SearchValidationErrors {
  const errors: SearchValidationErrors = {};

  const aMin = validatePositiveNumber(input.aMin, 'aMin', errors);
  const aMax = validatePositiveNumber(input.aMax, 'aMax', errors);
  const bMin = validatePositiveNumber(input.bMin, 'bMin', errors);
  const bMax = validatePositiveNumber(input.bMax, 'bMax', errors);
  const cMin = validatePositiveNumber(input.cMin, 'cMin', errors);
  const cMax = validatePositiveNumber(input.cMax, 'cMax', errors);

  if (aMin !== undefined && aMax !== undefined && aMin > aMax) {
    errors.aMax = 'Maximum must be greater than or equal to minimum.';
  }
  if (bMin !== undefined && bMax !== undefined && bMin > bMax) {
    errors.bMax = 'Maximum must be greater than or equal to minimum.';
  }
  if (cMin !== undefined && cMax !== undefined && cMin > cMax) {
    errors.cMax = 'Maximum must be greater than or equal to minimum.';
  }

  return { ...errors, ...validateNumericSearchInput(input) };
}

