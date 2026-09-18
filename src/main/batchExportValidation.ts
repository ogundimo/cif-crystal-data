import type { BatchExportScope, BatchExportRequest } from '../shared/types';
import { validateSearchFilter } from './searchFilterValidation';

export function validateBatchScope(value: unknown): BatchExportScope {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid batch scope');
  const scope = value as Partial<BatchExportScope>;
  if (scope.kind === 'matching') return { kind: 'matching', filter: structuredClone(validateSearchFilter(scope.filter)) };
  if (scope.kind !== 'selected' || !Array.isArray(scope.ids) || scope.ids.length > 100_000 ||
    scope.ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(scope.ids).size !== scope.ids.length) {
    throw new TypeError('Invalid selected entry IDs (maximum 100,000; no duplicates)');
  }
  return { kind: 'selected', ids: [...scope.ids].sort((a, b) => a - b) };
}

export function validateBatchRequest(value: unknown): BatchExportRequest {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid batch request');
  const request = value as BatchExportRequest;
  if (!['cif', 'both', 'csv'].includes(request.mode) || !Number.isSafeInteger(request.expectedCount) || request.expectedCount < 1) {
    throw new TypeError('Invalid batch format or count');
  }
  return { scope: validateBatchScope(request.scope), mode: request.mode, expectedCount: request.expectedCount };
}
