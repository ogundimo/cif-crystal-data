import type { PublicationLookupRequest, PublicationResolutionResult } from '../shared/types';

interface CrossrefCandidate {
  DOI?: unknown;
  title?: unknown;
  'container-title'?: unknown;
  author?: unknown;
  issued?: unknown;
  'published-print'?: unknown;
  'published-online'?: unknown;
  volume?: unknown;
  page?: unknown;
}

interface CitationParts {
  journal: string;
  year: string;
  volume: string;
  firstPage: string;
}

const resultCache = new Map<string, PublicationResolutionResult>();

function cleanMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/~/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeText(value: string): string {
  return cleanMarkup(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    const item = value.find((candidate) => typeof candidate === 'string');
    return typeof item === 'string' ? item.trim() : '';
  }
  return '';
}

function parseCitation(reference: string): CitationParts {
  const parts = reference.split(',').map((part) => part.trim()).filter(Boolean);
  const yearIndex = parts.findIndex((part) => /^(?:18|19|20)\d{2}$/.test(part));
  if (yearIndex < 1) return { journal: '', year: '', volume: '', firstPage: '' };
  const page = parts[yearIndex + 2] ?? '';
  return {
    journal: parts.slice(0, yearIndex).join(', '),
    year: parts[yearIndex],
    volume: parts[yearIndex + 1] ?? '',
    firstPage: page.match(/[A-Za-z]?\d+/)?.[0] ?? ''
  };
}

function candidateYear(candidate: CrossrefCandidate): string {
  for (const field of [candidate.issued, candidate['published-print'], candidate['published-online']]) {
    if (!field || typeof field !== 'object') continue;
    const dateParts = (field as { 'date-parts'?: unknown })['date-parts'];
    if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) continue;
    const year = dateParts[0][0];
    if (typeof year === 'number' && Number.isInteger(year)) return String(year);
  }
  return '';
}

function firstPage(value: string): string {
  return value.match(/[A-Za-z]?\d+/)?.[0] ?? '';
}

function authorSurnames(values: string[]): Set<string> {
  const surnames = values.flatMap((value): string[] => {
    const commaParts = value.split(',');
    if (commaParts.length > 1) {
      const family = normalizeText(commaParts[0] ?? '');
      return family ? [family] : [];
    }
    return normalizeText(value).split(' ').filter((word) => word.length > 2);
  });
  return new Set(surnames.filter((surname) => surname.length > 1));
}

function candidateAuthorSurnames(candidate: CrossrefCandidate): Set<string> {
  if (!Array.isArray(candidate.author)) return new Set();
  return new Set(
    candidate.author
      .map((author) => {
        if (!author || typeof author !== 'object') return '';
        return normalizeText(String((author as { family?: unknown }).family ?? ''));
      })
      .filter((surname) => surname.length > 1)
  );
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function normalizeDoi(value: unknown): string {
  if (typeof value !== 'string') return '';
  const doi = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi.replace(/[.,;]+$/, '') : '';
}

function doiUrl(doi: string): string {
  return `https://doi.org/${doi.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function isVerifiedCandidate(candidate: CrossrefCandidate, request: PublicationLookupRequest): boolean {
  const title = normalizeText(request.title);
  const candidateTitle = normalizeText(firstString(candidate.title));
  const citation = parseCitation(request.reference);
  const candidateJournal = normalizeText(firstString(candidate['container-title']));
  const journal = normalizeText(citation.journal);
  const year = candidateYear(candidate);
  const volume = normalizeText(firstString(candidate.volume));
  const page = firstPage(firstString(candidate.page)).toLowerCase();
  const requestedAuthors = authorSurnames(request.authors);
  const candidateAuthors = candidateAuthorSurnames(candidate);

  const yearMatches = Boolean(citation.year && year && citation.year === year);
  const journalMatches = Boolean(journal && candidateJournal && journal === candidateJournal);
  const volumeMatches = Boolean(citation.volume && volume && normalizeText(citation.volume) === volume);
  const pageMatches = Boolean(citation.firstPage && page && citation.firstPage.toLowerCase() === page);
  const authorMatches = requestedAuthors.size > 0 && intersects(requestedAuthors, candidateAuthors);

  // A title-bearing CIF must agree exactly after punctuation/case normalization.
  // It also needs two independent corroborating fields, one of which must be the year when supplied.
  if (title) {
    if (!candidateTitle || title !== candidateTitle) return false;
    if (citation.year && !yearMatches) return false;
    const corroboration = [yearMatches, journalMatches, volumeMatches, pageMatches, authorMatches]
      .filter(Boolean).length;
    return corroboration >= 2;
  }

  // Without a title, accept only a complete journal/year/volume/first-page fingerprint.
  // This deliberately rejects partial citations even if Crossref ranks one result highly.
  return journalMatches && yearMatches && volumeMatches && pageMatches;
}

export function verifyCrossrefCandidates(
  request: PublicationLookupRequest,
  candidates: CrossrefCandidate[]
): PublicationResolutionResult {
  const verified = candidates
    .map((candidate) => ({ candidate, doi: normalizeDoi(candidate.DOI) }))
    .filter(({ candidate, doi }) => Boolean(doi) && isVerifiedCandidate(candidate, request));
  const distinctDois = new Map(verified.map((match) => [match.doi.toLowerCase(), match]));
  if (distinctDois.size === 0) return { status: 'not-found' };
  if (distinctDois.size > 1) return { status: 'ambiguous' };
  const match = distinctDois.values().next().value as { candidate: CrossrefCandidate; doi: string };
  return {
    status: 'verified',
    doi: match.doi,
    url: doiUrl(match.doi),
    matchedTitle: firstString(match.candidate.title)
  };
}

export async function resolvePublication(
  request: PublicationLookupRequest,
  fetchImpl: typeof fetch = fetch
): Promise<PublicationResolutionResult> {
  const normalizedRequest = {
    title: request.title.trim(),
    reference: request.reference.trim(),
    authors: request.authors.map((author) => author.trim()).filter(Boolean).slice(0, 20)
  };
  const citation = parseCitation(normalizedRequest.reference);
  if (!normalizedRequest.title && !(citation.journal && citation.year && citation.volume && citation.firstPage)) {
    return { status: 'insufficient-metadata' };
  }

  const cacheKey = JSON.stringify(normalizedRequest);
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const query = [normalizedRequest.title, normalizedRequest.reference, normalizedRequest.authors.join('; ')]
    .filter(Boolean)
    .join('. ');
  const parameters = new URLSearchParams({
    'query.bibliographic': query,
    rows: '5',
    select: 'DOI,title,container-title,author,issued,published-print,published-online,volume,page'
  });

  try {
    const response = await fetchImpl(`https://api.crossref.org/works?${parameters.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CIF-Crystal-Data/1.0'
      },
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return { status: 'unavailable' };
    const body = await response.json() as { message?: { items?: unknown } };
    const candidates = Array.isArray(body.message?.items)
      ? body.message.items.filter((item): item is CrossrefCandidate => Boolean(item && typeof item === 'object'))
      : [];
    const result = verifyCrossrefCandidates(normalizedRequest, candidates);
    resultCache.set(cacheKey, result);
    return result;
  } catch {
    return { status: 'unavailable' };
  }
}
