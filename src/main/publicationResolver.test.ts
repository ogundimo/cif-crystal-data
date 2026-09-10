import { describe, expect, it } from 'vitest';
import type { PublicationLookupRequest } from '../shared/types';
import { resolvePublication, verifyCrossrefCandidates } from './publicationResolver';

const request: PublicationLookupRequest = {
  title: 'A new ternary chalcogenide structure',
  reference: 'Journal of Solid State Chemistry, 2013, 42, 2679-2682',
  authors: ['Doe, J.', 'Roe, A.']
};

function exactCandidate(doi = '10.1000/example') {
  return {
    DOI: doi,
    title: ['A new ternary chalcogenide structure'],
    'container-title': ['Journal of Solid State Chemistry'],
    author: [{ family: 'Doe' }],
    issued: { 'date-parts': [[2013, 2, 1]] },
    volume: '42',
    page: '2679-2682'
  };
}

describe('verifyCrossrefCandidates', () => {
  it('accepts an exact title corroborated by citation metadata', () => {
    expect(verifyCrossrefCandidates(request, [exactCandidate()])).toEqual({
      status: 'verified',
      doi: '10.1000/example',
      url: 'https://doi.org/10.1000/example',
      matchedTitle: 'A new ternary chalcogenide structure'
    });
  });

  it('treats CIF and HTML chemical subscript markup as equivalent', () => {
    const markedRequest = { ...request, title: 'On the structure of KAsSe~2~' };
    const candidate = {
      ...exactCandidate(),
      title: ['On the structure of KAsSe<sub>2</sub>'],
      issued: { 'date-parts': [[2013]] }
    };
    expect(verifyCrossrefCandidates(markedRequest, [candidate]).status).toBe('verified');
  });

  it('rejects a highly ranked candidate with the wrong title', () => {
    const candidate = { ...exactCandidate(), title: ['A different chalcogenide structure'] };
    expect(verifyCrossrefCandidates(request, [candidate])).toEqual({ status: 'not-found' });
  });

  it('rejects an exact title when the publication year conflicts', () => {
    const candidate = { ...exactCandidate(), issued: { 'date-parts': [[2014]] } };
    expect(verifyCrossrefCandidates(request, [candidate])).toEqual({ status: 'not-found' });
  });

  it('does not choose between multiple independently verified DOIs', () => {
    expect(
      verifyCrossrefCandidates(request, [exactCandidate('10.1000/one'), exactCandidate('10.1000/two')])
    ).toEqual({ status: 'ambiguous' });
  });

  it('accepts a title-less citation only when its full bibliographic fingerprint agrees', () => {
    const titleless = { ...request, title: '', authors: [] };
    expect(verifyCrossrefCandidates(titleless, [exactCandidate()]).status).toBe('verified');
    expect(
      verifyCrossrefCandidates(titleless, [{ ...exactCandidate(), page: '2680-2688' }])
    ).toEqual({ status: 'not-found' });
  });
});

describe('resolvePublication', () => {
  it('does not contact Crossref for incomplete title-less citations', async () => {
    let called = false;
    const result = await resolvePublication(
      { title: '', reference: 'Journal of Chemistry, 2013', authors: [] },
      (async () => {
        called = true;
        throw new Error('unexpected request');
      }) as typeof fetch
    );
    expect(result).toEqual({ status: 'insufficient-metadata' });
    expect(called).toBe(false);
  });

  it('requests several candidates and verifies their returned metadata', async () => {
    let requestedUrl = '';
    const result = await resolvePublication(
      { ...request, title: `${request.title} unique` },
      (async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return {
          ok: true,
          json: async () => ({
            message: { items: [{ ...exactCandidate(), title: [`${request.title} unique`] }] }
          })
        } as Response;
      }) as typeof fetch
    );
    expect(result.status).toBe('verified');
    expect(requestedUrl).toContain('rows=5');
    expect(requestedUrl).toContain('query.bibliographic=');
  });
});
