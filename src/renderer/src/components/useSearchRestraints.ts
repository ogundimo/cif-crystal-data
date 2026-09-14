import { useEffect, useState } from 'react';
import type { RestraintRow } from '../../../shared/types';
import { scheduleDebouncedRequest } from '../debouncedRequest';
import { toFilter, type FormState } from './quickSearchForm';

export type RestraintsStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useSearchRestraints(form: FormState, isValid: boolean, open: boolean, resetSignal?: number) {
  const [restraints, setRestraints] = useState<RestraintRow[]>([]);
  const [restraintsStatus, setRestraintsStatus] = useState<RestraintsStatus>('idle');
  const [restraintsRetry, setRestraintsRetry] = useState(0);

  useEffect(() => {
    if (resetSignal === undefined) return;
    setRestraints([]);
    setRestraintsStatus('idle');
  }, [resetSignal]);

  useEffect(() => {
    if (!open) return;
    if (!isValid) {
      setRestraints([]);
      setRestraintsStatus('idle');
      return;
    }
    return scheduleDebouncedRequest({
      delay: 250,
      request: () => window.cifApi.restraints(toFilter(form)),
      onStart: () => setRestraintsStatus('loading'),
      onSuccess: (rows) => {
        setRestraints(rows);
        setRestraintsStatus('ready');
      },
      onError: () => {
        setRestraints([]);
        setRestraintsStatus('error');
      }
    });
  }, [form, isValid, open, restraintsRetry]);

  return { restraints, restraintsStatus, retryRestraints: () => setRestraintsRetry(value => value + 1) };
}
