import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchFilter } from '../../../shared/types';
import { validateSearchInput } from '../../../shared/searchValidation';
import { emptyForm, hasSearchCriteria, toFilter, type FormState } from './quickSearchForm';
import { useSearchRestraints } from './useSearchRestraints';
import { QuickSearchFields } from './QuickSearchFields';
import { QuickSearchPreview } from './QuickSearchPreview';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  onSearch: (filter: SearchFilter) => void;
  resetSignal?: number;
}

export default function QuickSearchDialog({ open, onClose, onSearch, resetSignal }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [appliedForm, setAppliedForm] = useState<FormState>(emptyForm);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | 3 | 4>(1);
  const validationErrors = useMemo(() => validateSearchInput(form), [form]);
  const isValid = Object.keys(validationErrors).length === 0;
  const hasCriteria = hasSearchCriteria(form);
  const { restraints, restraintsStatus, retryRestraints } = useSearchRestraints(form, isValid, open, resetSignal);
  const discardAndClose = useCallback(() => {
    setForm(appliedForm);
    onClose();
  }, [appliedForm, onClose]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setForm(emptyForm);
    setAppliedForm(emptyForm);
    setActiveSlot(1);
  }, [resetSignal]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        discardAndClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const dialog = dialogRef.current;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (active === dialog || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [discardAndClose, open]);

  if (!open) return null;

  function clearAll() {
    setForm(emptyForm);
    setActiveSlot(1);
  }

  function handleSearch() {
    if (!isValid || !hasCriteria) return;
    setAppliedForm(form);
    onSearch(toFilter(form));
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) discardAndClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-search-title"
        tabIndex={-1}
        className="quick-search-dialog"
      >
        <div className="quick-search-titlebar">
          <span id="quick-search-title">Quick search</span>
        </div>
        <button
          type="button"
          className="quick-search-close"
          onClick={discardAndClose}
          aria-label="Close"
        >
          ✕
        </button>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSearch();
            }
          }}
        >
        <div className="quick-search-content">
          <div className="flex flex-col gap-2">
            <div className="quick-search-main-grid">
            <QuickSearchFields form={form} setForm={setForm} activeSlot={activeSlot}
              setActiveSlot={setActiveSlot} validationErrors={validationErrors} />
          </div>

            <QuickSearchPreview isValid={isValid} restraints={restraints}
              restraintsStatus={restraintsStatus} onRetry={retryRestraints} />
          </div>
        </div>

        <div className="quick-search-footer">
          <button type="submit" className="btn-w32 btn-primary min-w-[74px] disabled:cursor-not-allowed disabled:opacity-50" disabled={!isValid || !hasCriteria}>
            Search!
          </button>
          <button type="button" className="btn-w32" onClick={discardAndClose}>
            Cancel
          </button>
          <button type="button" className="btn-w32" onClick={clearAll}>
            Clear all
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
