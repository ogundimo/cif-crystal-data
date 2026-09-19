import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EntryRow } from '../../../shared/types';
import PublicationReference, { publicationTarget } from './PublicationReference';

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
  it('renders CIF subscripts in the title without changing stored text or link selection', () => {
    const entry = { ...baseEntry, publ_title: 'Phase relations in FeGa~2~Se~4~: 2019', citation_doi: '10.1000/test' };
    const html = renderToStaticMarkup(createElement(PublicationReference, { entry }));
    expect(html).toContain('Phase relations in FeGa<sub>2</sub>Se<sub>4</sub>: 2019</button>');
    expect(html).toContain('title="Phase relations in FeGa2Se4: 2019 — verify and open publication link"');
    expect(entry.publ_title).toBe('Phase relations in FeGa~2~Se~4~: 2019');
    expect(publicationTarget(entry).url).toBe('https://doi.org/10.1000/test');
  });

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

it('formats the reported rare-earth title and reference fallback without changing source metadata', () => {
  const title = 'Rare-earth indium selenides RE$_3$InSe$_6$ (RE = La-Nd, Sm, Gd, Tb). Structural evolution from tetrahedral to octahedral sites';
  const reference = `Journal of Solid State Chemistry, 2021, 297, ${title}.`;
  for (const publ_title of [title, '']) {
    const entry = { ...baseEntry, publ_title, reference };
    const html = renderToStaticMarkup(createElement(PublicationReference, { entry }));
    expect(html).toContain('RE<sub>3</sub>InSe<sub>6</sub>');
    expect(html).not.toContain('$_');
    expect(entry.reference).toBe(reference);
    expect(entry.publ_title).toBe(publ_title);
  }
});
