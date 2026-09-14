import type { ElementSelections, SearchFilter } from '../../../shared/types';
import { createEmptyElementSelection } from '../../../shared/periodicTableData';

export interface FormState {
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

export const emptyForm: FormState = {
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

export function toFilter(form: FormState): SearchFilter {
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

export function hasSearchCriteria(form: FormState): boolean {
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
