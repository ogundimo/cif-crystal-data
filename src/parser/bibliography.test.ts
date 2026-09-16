import { describe, expect, it } from 'vitest';
import { parseCif } from './cifParser';
const base = `data_demo
_chemical_formula_sum 'Na Cl'
_cell_length_a 5
_cell_length_b 5
_cell_length_c 5
_space_group_IT_number 1
_space_group_name_H-M_alt 'P 1'
`;

describe('bibliography recovery', () => {
  it('keeps blank lines/comments and text-field edge tokens aligned', () => {
    const entry = parseCif(base + `loop_
_citation_id
# header comment
_citation_title
_citation_journal_full
_citation_year
_citation_journal_volume
_citation_page_first

primary
;Opening title
continued
; 'Synthetic journal' 2026
# row continues
12 e123
_exptl_crystal_colour blue
`);
    expect(entry.publTitle).toBe('Opening title continued');
    expect(entry.reference).toBe('Synthetic journal, 2026, 12, e123');
    expect(entry.crystalColour).toBe('blue');
  });
  it('reads scalar text after blank lines and never treats quoted control words as tags', () => {
    const entry = parseCif(base + `_publ_section_title

# scalar comment
;A report
on salts
;
loop_
_publ_author_name
_publ_author_address
'_author' 'loop_'
`);
    expect(entry.publTitle).toBe('A report on salts');
    expect(entry.publAuthors).toEqual([{ name: '_author', address: 'loop_' }]);
    expect(entry.reference).toBe('A report on salts');
  });
  it('selects primary citation and only its associated authors without mixing references', () => {
    const entry = parseCif(base + `loop_
_citation_id
_citation_title
_citation_year
_citation_doi
other 'Other paper' 2000 10.1/other
primary 'Selected paper' 2026 10.1/selected
loop_
_citation_author_citation_id
_citation_author_name
other 'Other author'
primary 'Publication author'
loop_
_audit_author_name
_audit_author_address
'Data author' 'Data institute'
`);
    expect(entry.reference).toBe('2026, Selected paper, 10.1/selected');
    expect(entry.publAuthors).toEqual([{ name: 'Publication author', address: null }]);
    expect(entry.dataAuthors).toEqual([{ name: 'Data author', address: 'Data institute' }]);
  });
  it('preserves unknown authors as unavailable and supports scalar audit authors', () => {
    const entry = parseCif(base + `_audit_author_name 'Depositor'
_audit_author_address ?
_journal_year 2026
_journal_paper_doi 'https://doi.org/10.1/example'
`);
    expect(entry.reference).toBe('2026, 10.1/example');
    expect(entry.publAuthors).toEqual([]);
    expect(entry.dataAuthors).toEqual([{ name: 'Depositor', address: null }]);
    expect(parseCif(base + '_audit_author_name .').dataAuthors).toEqual([]);
  });
  it('rejects incomplete rows and unterminated strings instead of losing alignment', () => {
    expect(() => parseCif(base + 'loop_\n_citation_year\n_citation_title\n2026')).toThrow('Incomplete CIF loop row');
    expect(() => parseCif(base + "_publ_section_title 'broken")).toThrow('Unterminated');
    expect(() => parseCif(base + '_publ_section_title\n;broken')).toThrow('Unterminated');
  });
});

it('combines a scalar primary title with its loop citation, without borrowing it for secondary citations', () => {
  const bibliography = `_citation_title

;Synthetic scalar title
;
loop_
_citation_id
_citation_journal_full
_citation_year
primary 'Synthetic journal' 2026
`;
  expect(parseCif(base + bibliography).publTitle).toBe('Synthetic scalar title');
  expect(parseCif(base + bibliography.replace("primary 'Synthetic journal'", "secondary 'Synthetic journal'")).publTitle).toBe('');
});

it('does not attach a scalar author explicitly assigned to another citation', () => {
  const entry = parseCif(base + `_citation_author_name 'Unrelated author'
_citation_author_citation_id other
loop_
_citation_id
_citation_title
primary 'Selected title'
other 'Other title'
`);
  expect(entry.publTitle).toBe('Selected title');
  expect(entry.publAuthors).toEqual([]);
});
