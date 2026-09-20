import type { BatchExportScope, BatchExportRequest } from '../shared/types';
import { validateSearchFilter } from './searchFilterValidation';

export function validateBatchScope(value: unknown): BatchExportScope {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid batch scope');
  const scope = value as Partial<BatchExportScope>;
  if (scope.kind === 'matching') return {
    kind: 'matching', filter: structuredClone(validateSearchFilter(scope.filter)),
    ...(scope.excludedIds === undefined ? {} : { excludedIds: validateIds(scope.excludedIds) })
  };
  if (scope.kind !== 'selected') throw new TypeError('Invalid batch scope');
  return { kind: 'selected', ids: validateIds(scope.ids) };
}

function validateIds(ids: unknown): number[] {
  if (!Array.isArray(ids) || ids.length > 100_000 ||
    ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    throw new TypeError('Invalid selected entry IDs (maximum 100,000; no duplicates)');
  }
  return [...ids].sort((a, b) => a - b);
}

export function validateBatchRequest(value: unknown): BatchExportRequest {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid batch request');
  const request = value as BatchExportRequest;
  if ('mode' in request || !Number.isSafeInteger(request.expectedCount) || request.expectedCount < 1) {
    throw new TypeError('Invalid batch request or count');
  }
  return { scope: validateBatchScope(request.scope), expectedCount: request.expectedCount };
}
