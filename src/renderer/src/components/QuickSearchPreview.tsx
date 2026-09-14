import type { RestraintRow } from '../../../shared/types';
import type { RestraintsStatus } from './useSearchRestraints';

interface Props {
  isValid: boolean;
  restraints: RestraintRow[];
  restraintsStatus: RestraintsStatus;
  onRetry: () => void;
}

export function QuickSearchPreview({ isValid, restraints, restraintsStatus, onRetry }: Props) {
  return (
    <div className="quick-search-preview" aria-live="polite">
      <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="w-44 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Field</th>
          <th className="border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Content</th>
          <th className="w-16 border-b border-stroke-strong bg-[#f6f6f6] px-2 py-1 text-left text-[11px] font-medium">Entries</th>
        </tr>
      </thead>
      <tbody>
        {!isValid ? (
          <tr>
            <td colSpan={3} className="px-2 py-1 text-red-700">
              Correct the invalid search values to preview matching entries.
            </td>
          </tr>
        ) : restraintsStatus === 'loading' ? (
          <tr>
            <td colSpan={3} className="px-2 py-1 text-text-dim">
              Updating preview…
            </td>
          </tr>
        ) : restraintsStatus === 'error' ? (
          <tr>
            <td colSpan={3} className="px-2 py-1 text-red-700">
              Could not update the preview.
              <button
                type="button"
                className="ml-2 font-semibold text-accent hover:underline"
                onClick={onRetry}
              >
                Retry
              </button>
            </td>
          </tr>
        ) : restraints.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-2 py-1 text-gray-400">
              No restraints defined
            </td>
          </tr>
        ) : (
          restraints.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.field}</td>
              <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.content}</td>
              <td className="border-b border-[#f0f0f0] px-2 py-1 text-text-dim">{r.entries}</td>
            </tr>
          ))
        )}
      </tbody>
      </table>
    </div>
  );
}
