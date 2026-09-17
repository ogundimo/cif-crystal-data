import type { ImportProgress } from '../../../shared/types';

interface Props {
  progress: ImportProgress;
}

export default function ImportProgressIndicator({ progress }: Props) {
  if (progress.phase === 'discovery') return <div role="status" data-testid="import-progress"><progress aria-label="Discovering CIF files" /> Discovering: {progress.discovered ?? progress.total} files found</div>;
  return (
    <div
      data-testid="import-progress"
      className="flex items-center gap-1.5 text-[11px] text-text-dim"
      aria-live="polite"
      aria-label={`Import progress: ${progress.processed} of ${progress.total} files processed`}
    >
      <progress
        className="h-2 w-20 accent-accent"
        max={Math.max(1, progress.total)}
        value={progress.processed}
      />
      <span>
        {progress.importedCount} structures imported
        {progress.skippedCount > 0 ? `, ${progress.skippedCount} unchanged` : ''}
        {progress.failureCount > 0 ? `, ${progress.failureCount} failed` : ''}
      </span>
    </div>
  );
}
