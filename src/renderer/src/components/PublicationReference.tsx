import { useState } from 'react';
import type { EntryRow, PublAuthorRow } from '../../../shared/types';
import { formatCifText, plainCifText } from '../formatFormula';

interface PublicationTarget {
  label: string;
  url: string | null;
}

export function publicationTarget(entry: EntryRow): PublicationTarget {
  const doi = entry.citation_doi.trim();
  const ccdc = entry.database_code_ccdc.trim().replace(/^CCDC\s*/i, '');
  const csd = entry.database_code_csd.trim().replace(/^CSD\s*/i, '');
  const icsd = entry.database_code_icsd.trim().replace(/^ICSD\s*/i, '');
  const title = entry.publ_title.trim();
  const reference = entry.reference.trim();
  const scholarQuery = title ? `"${title}" ${reference}` : `${reference} ${entry.formula}`.trim();
  const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;
  const accessStructuresUrl = (code: string) =>
    `https://www.ccdc.cam.ac.uk/structures/Search?Ccdcid=${encodeURIComponent(code)}&DatabaseToSearch=Published`;
  const doiUrl = doi
    ? `https://doi.org/${doi.split('/').map((part) => encodeURIComponent(part)).join('/')}`
    : null;

  if (doiUrl) return { label: title || doi, url: doiUrl };
  if (ccdc) {
    return {
      label: title || reference || `CCDC ${ccdc}`,
      url: accessStructuresUrl(`CCDC ${ccdc}`)
    };
  }
  if (csd) {
    return {
      label: title || reference || `CSD ${csd}`,
      url: accessStructuresUrl(`CSD ${csd}`)
    };
  }
  if (icsd) {
    return {
      label: title || reference || `ICSD ${icsd}`,
      url: accessStructuresUrl(`ICSD ${icsd}`)
    };
  }
  if (title) return { label: title, url: scholarUrl };
  if (reference) return { label: reference, url: scholarUrl };
  return { label: '', url: null };
}

export default function PublicationReference({
  entry,
  authors = []
}: {
  entry: EntryRow;
  authors?: PublAuthorRow[];
}) {
  const target = publicationTarget(entry);
  const [resolving, setResolving] = useState(false);
  if (!target.url) return <>{formatCifText(target.label)}</>;
  return (
    <button
      type="button"
      disabled={resolving}
      className="max-w-full whitespace-normal break-words py-0.5 text-left leading-5 text-[#0067b8] underline decoration-[#0067b8]/50 underline-offset-2 hover:text-[#004f8c]"
      title={`${plainCifText(target.label)} — verify and open publication link`}
      onClick={async (event) => {
        event.stopPropagation();
        setResolving(true);
        try {
          let destination = target.url as string;
          if (!entry.citation_doi.trim()) {
            const resolution = await window.cifApi.resolvePublication({
              title: entry.publ_title,
              reference: entry.reference,
              authors: authors.map((author) => author.name)
            });
            if (resolution.status === 'verified' && resolution.url) destination = resolution.url;
          }
          await window.cifApi.openExternal(destination);
        } catch {
          window.alert(`Could not open the publication link:\n${target.url}`);
        } finally {
          setResolving(false);
        }
      }}
    >
      {resolving ? 'Resolving publication…' : formatCifText(target.label)}
    </button>
  );
}
