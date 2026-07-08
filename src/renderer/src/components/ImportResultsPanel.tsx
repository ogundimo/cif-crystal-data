import React from 'react';
import type { ImportResult } from '../../../shared/types';

interface Props {
  result: ImportResult;
  onDismiss: () => void;
}

export default function ImportResultsPanel({ result, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-40 w-96 rounded-md border border-stroke-strong bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-stroke px-3 py-2 font-semibold">
        <span>Import results</span>
        <span className="flex-1" />
        <button className="rounded px-2 hover:bg-[#e9e9e9]" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
      <div className="max-h-72 overflow-auto px-3 py-2">
        <p className="mb-2">
          Imported <b>{result.importedCount}</b> of <b>{result.total}</b> file(s) successfully.
        </p>
        {result.failures.length > 0 && (
          <>
            <p className="mb-1 font-semibold text-[#c42b1c]">Failures ({result.failures.length}):</p>
            <ul className="flex flex-col gap-1">
              {result.failures.map((f, i) => (
                <li key={i} className="text-[11px]">
                  <span className="font-medium">{f.filename}</span>: {f.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
