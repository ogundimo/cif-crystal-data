import { describe, expect, it } from 'vitest';
import type { EntryRow } from '../../../shared/types';
import { publicationTarget } from './PublicationReference';

const baseEntry = {
  formula: 'Gd2S5Zr1',
  reference: '',
  publ_title: '',
  citation_doi: '',
  database_code_ccdc: '',
  database_code_csd: '',
  database_code_icsd: ''
} as EntryRow;

describe('publicationTarget', () => {
  it('prefers and safely encodes a DOI', () => {
    const target = publicationTarget({
      ...baseEntry,
      publ_title: 'A crystal structure',
      citation_doi: '10.1000/a?b'
    });
    expect(target.label).toBe('A crystal structure');
    expect(target.url).toBe('https://doi.org/10.1000/a%3Fb');
  });

  it('links CCDC deposition numbers directly', () => {
    const target = publicationTarget({ ...baseEntry, database_code_ccdc: 'CCDC 2515493' });
    expect(target.label).toBe('CCDC 2515493');
    expect(target.url).toContain('Ccdcid=CCDC%202515493');
  });

  it('links ICSD identifiers instead of using a formula-only Scholar query', () => {
    const target = publicationTarget({
      ...baseEntry,
      reference: 'American Mineralogist, 1971, 56, 1882-1888',
      database_code_icsd: '15213'
    });
    expect(target.label).toBe('American Mineralogist, 1971, 56, 1882-1888');
    expect(target.url).toContain('Ccdcid=ICSD%2015213');
  });

  it('uses exact title and bibliography terms for PCD Scholar searches', () => {
    const target = publicationTarget({
      ...baseEntry,
      publ_title: 'Novel chalcogenide structure',
      reference: 'Dalton Trans., 2013, 42, 2679-2682'
    });
    expect(decodeURIComponent(target.url ?? '')).toContain(
      'q="Novel chalcogenide structure" Dalton Trans., 2013, 42, 2679-2682'
    );
  });
});
