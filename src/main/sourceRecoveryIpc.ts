import { dialog } from 'electron';
import type { ipcMain } from 'electron';
import type { SourceRecoveryRequest, SourceRecoveryResult } from '../shared/types';

type Operation = (database: typeof import('./db')) => Promise<SourceRecoveryResult>;

function validateRecoveryRequest(value: unknown): SourceRecoveryRequest {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid recovery request.');
  const request = value as SourceRecoveryRequest;
  if (!Number.isSafeInteger(request.entryId) || request.entryId < 1 ||
      !['inspect', 'choose-cif', 'choose-backup', 'prepare-remove', 'confirm'].includes(request.action)) throw new TypeError('Invalid recovery request.');
  if (request.action === 'confirm' && (typeof request.token !== 'string' || request.token.length > 100 ||
      !Number.isSafeInteger(request.choice) || request.choice < 0)) throw new TypeError('Invalid recovery confirmation.');
  return request;
}

export function registerSourceRecovery(handle: typeof ipcMain.handle, exclusive: (operation: Operation) => Promise<SourceRecoveryResult>): void {
  handle('cif:sourceRecovery', async (_event, value: unknown) => {
    const request = validateRecoveryRequest(value);
    return exclusive(async database => {
      if (request.action === 'inspect') return database.inspectSourceRecovery(request.entryId);
      if (request.action === 'prepare-remove') return database.prepareSourceRemoval(request.entryId);
      if (request.action === 'confirm') return database.confirmSourceRecovery(request.entryId, request.token, request.choice);
      const backup = request.action === 'choose-backup';
      const result = await dialog.showOpenDialog({ title: backup ? 'Look in portable backup' : 'Locate CIF source',
        properties: ['openFile'], filters: [{ name: backup ? 'CIF backup' : 'CIF', extensions: [backup ? 'cifbackup' : 'cif'] }] });
      if (result.canceled || !result.filePaths.length) return { eligible: true, cancelled: true };
      return database.previewSourceRecovery(request.entryId, result.filePaths[0], backup);
    });
  });
}
