import { useEffect, useLayoutEffect, useState, type Dispatch, type SetStateAction, type RefObject } from 'react';

export function readPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`cif-layout-v1:${key}`) ?? 'null');
    return valid(value) ? value : fallback;
  } catch { return fallback; }
}

export function useLayoutPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readPreference(key, fallback, valid));
  useEffect(() => {
    try { localStorage.setItem(`cif-layout-v1:${key}`, JSON.stringify(value)); } catch { /* Storage can be unavailable. Keep the live layout usable. */ }
  }, [key, value]);
  return [value, setValue];
}

const validPanelSize = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000);
export function usePanelSize(key: string, container: RefObject<HTMLDivElement>, minimum: number, reserved: number, axis: 'width' | 'height') {
  const [value, setValue] = useLayoutPreference<number | null>(key, null, validPanelSize);
  // Reconnect when an initially empty workspace mounts its panes.
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const clamp = () => {
      const extent = axis === 'width' ? element.clientWidth : element.clientHeight;
      if (extent <= 0) return;
      const maximum = Math.max(minimum, extent - reserved);
      setValue(current => current === null ? null : Math.min(maximum, Math.max(minimum, current)));
    };
    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(element);
    return () => observer.disconnect();
  });
  return [value, setValue] as const;
}

export function usePanePercentage(container: RefObject<HTMLDivElement>, selector: string, axis: 'width' | 'height') {
  const [percentage, setPercentage] = useState(50);
  useLayoutEffect(() => {
    const parent = container.current;
    const pane = parent?.querySelector<HTMLElement>(selector);
    if (!parent || !pane) return;
    const measure = () => {
      const total = parent.getBoundingClientRect()[axis];
      if (total > 0) setPercentage(Math.max(0, Math.min(100, Math.round(pane.getBoundingClientRect()[axis] / total * 100))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(pane);
    measure();
    return () => observer.disconnect();
  });
  return percentage;
}

export function validColumnWidths(value: unknown): value is Record<string, number> {
  const columns = new Set(['formula', 'cell_a', 'cell_b', 'cell_c', 'sg_number', 'space_group', 'reference', 'level_struct_studies']);
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, width]) => columns.has(key) && typeof width === 'number' && Number.isFinite(width) && width >= 20 && width <= 4000);
}
