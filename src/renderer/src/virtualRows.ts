export interface VirtualRowWindow {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
}

interface VirtualRowWindowOptions {
  rowCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  headerHeight: number;
  overscan: number;
}

/** Calculate the half-open slice of fixed-height rows that should exist in the DOM. */
export function calculateVirtualRowWindow({
  rowCount,
  scrollTop,
  viewportHeight,
  rowHeight,
  headerHeight,
  overscan
}: VirtualRowWindowOptions): VirtualRowWindow {
  if (rowCount <= 0) return { start: 0, end: 0, paddingTop: 0, paddingBottom: 0 };

  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);
  const firstVisible = Math.floor(bodyScrollTop / rowHeight);
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const start = Math.max(0, Math.min(rowCount - 1, firstVisible - overscan));
  const end = Math.min(rowCount, firstVisible + visibleCount + overscan);

  return {
    start,
    end: Math.max(start + 1, end),
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (rowCount - end) * rowHeight)
  };
}
