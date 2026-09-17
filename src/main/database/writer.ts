import { readFileSync } from 'node:fs';
import { contentHash, sourceKey } from '../sourceIdentity';
import type Database from 'better-sqlite3';
import type { CifEntry } from '../../parser/cifParser';
import { getDb } from './connection';

export interface EntryWriteItem {
  sourceFilename: string;
  sourcePath?: string;
  sourceMtimeMs?: number;
  sourceSize?: number;
  dataBlockIndex?: number;
  blockKey?: string;
  sourceContent?: Buffer;
  blockHash?: string;
  outcome?: 'created' | 'updated' | 'duplicate';
  entry: CifEntry;
}

export interface FileFingerprint {
  path: string;
  mtimeMs: number;
  size: number;
}

interface EntryWriteFailure {
  item: EntryWriteItem;
  error: unknown;
}

export interface EntryWriter {
  writeBatch: (items: EntryWriteItem[]) => EntryWriteFailure[];
  isUnchanged?: (file: FileFingerprint) => boolean;
}

/** Prepare one reusable writer whose batches commit once while each file remains atomic. */
export function createEntryWriter(database: Database.Database = getDb()): EntryWriter {
  const selectEntry = database.prepare('SELECT id FROM entries WHERE source_key = ? AND block_key = ?');
  const selectLegacy = database.prepare(`SELECT e.id FROM entries e JOIN imported_files f ON f.entry_id = e.id
    WHERE e.source_key IS NULL AND f.source_path = ? ${process.platform === 'win32' ? 'COLLATE NOCASE' : ''} AND f.data_block_index = ?`);
  const setIdentity = database.prepare('UPDATE entries SET source_key = ?, block_key = ?, source_filename = ? WHERE id = ?');
  const findDuplicate = database.prepare('SELECT 1 FROM imported_files f JOIN entries e ON e.id = f.entry_id WHERE f.content_hash = ? AND e.source_key != ? LIMIT 1');
  const storeContent = database.prepare('INSERT OR IGNORE INTO source_contents(hash, content) VALUES (?, ?)');
  const updateEntry = database.prepare(
    `UPDATE entries SET formula = ?, cell_a = ?, cell_b = ?, cell_c = ?, cell_angle_alpha = ?,
     cell_angle_beta = ?, cell_angle_gamma = ?, cell_volume = ?, sg_number = ?,
     space_group = ?, reference = ?, level_struct_studies = ?, sample_type = ?,
     crystal_colour = ?, publ_title = ?, citation_doi = ?, database_code_ccdc = ?,
     database_code_csd = ?, database_code_icsd = ?, journal_language = ?, cell_a_angstrom = ?,
     cell_b_angstrom = ?, cell_c_angstrom = ?, formula_units_z = ?, radiation_type = ?,
     radiation_wavelength_angstrom = ? WHERE id = ?`
  );
  const deleteElements = database.prepare('DELETE FROM entry_elements WHERE entry_id = ?');
  const insertEntry = database.prepare(
    `INSERT INTO entries
     (source_filename, formula, cell_a, cell_b, cell_c, cell_angle_alpha, cell_angle_beta,
      cell_angle_gamma, cell_volume, sg_number, space_group, reference,
      level_struct_studies, sample_type, crystal_colour, publ_title, citation_doi,
      database_code_ccdc, database_code_csd, database_code_icsd, journal_language,
      cell_a_angstrom, cell_b_angstrom, cell_c_angstrom, formula_units_z, radiation_type,
      radiation_wavelength_angstrom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertElement = database.prepare(
    'INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)'
  );
  const deleteAtomSites = database.prepare('DELETE FROM atom_sites WHERE entry_id = ?');
  const deleteDataAuthors = database.prepare('DELETE FROM data_authors WHERE entry_id = ?');
  const insertDataAuthor = database.prepare('INSERT INTO data_authors(entry_id, author_order, name, address) VALUES (?, ?, ?, ?)');
  const deletePublAuthors = database.prepare('DELETE FROM publ_authors WHERE entry_id = ?');
  const deleteSymmetryOperations = database.prepare(
    'DELETE FROM symmetry_operations WHERE entry_id = ?'
  );
  const deleteAtomSiteAnisotropic = database.prepare(
    'DELETE FROM atom_site_anisotropic WHERE entry_id = ?'
  );
  const insertPublAuthor = database.prepare(
    'INSERT INTO publ_authors (entry_id, author_order, name, address) VALUES (?, ?, ?, ?)'
  );
  const insertAtomSite = database.prepare(
    `INSERT INTO atom_sites
     (entry_id, site_order, type_symbol, site_label, symmetry_multiplicity, wyckoff_symbol,
      fract_x, fract_y, fract_z, occupancy, u_iso_or_equiv, b_iso_or_equiv)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSymmetryOperation = database.prepare(
    `INSERT INTO symmetry_operations
     (entry_id, operation_order, operation_id, operation_xyz)
     VALUES (?, ?, ?, ?)`
  );
  const insertAtomSiteAnisotropic = database.prepare(
    `INSERT INTO atom_site_anisotropic
     (entry_id, site_order, site_label, u_11, u_22, u_33, u_12, u_13, u_23,
      b_11, b_22, b_33, b_12, b_13, b_23)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const selectFingerprint = database.prepare(`SELECT f.content_hash, f.source_mtime_ms FROM imported_files f
    JOIN entries e ON e.id = f.entry_id WHERE e.source_key = ?`);
  const upsertFingerprint = database.prepare(
    `INSERT INTO imported_files (entry_id, source_filename, source_path, source_mtime_ms, source_size, data_block_index, content_hash, block_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entry_id) DO UPDATE SET source_filename = excluded.source_filename, source_path = excluded.source_path,
       source_mtime_ms = excluded.source_mtime_ms, source_size = excluded.source_size,
       data_block_index = excluded.data_block_index, content_hash = excluded.content_hash, block_hash = excluded.block_hash`
  );
  const selectSourceEntries = database.prepare(`SELECT id, block_key FROM entries WHERE source_key = ?
    OR (source_key IS NULL AND id IN (SELECT entry_id FROM imported_files WHERE source_path = ? ${process.platform === 'win32' ? 'COLLATE NOCASE' : ''}))`);
  const deleteEntry = database.prepare('DELETE FROM entries WHERE id = ?');

  const writeOne = (item: EntryWriteItem) => {
    const { sourceFilename, entry } = item;
    const key = item.sourcePath ? sourceKey(item.sourcePath) : `unlinked:${sourceFilename}`;
    const blockKey = item.blockKey ?? `legacy:${item.dataBlockIndex ?? 0}`;
    const existing = (selectEntry.get(key, blockKey) ?? (item.sourcePath
      ? selectLegacy.get(item.sourcePath, item.dataBlockIndex ?? 0) : undefined)) as { id: number } | undefined;
    const hash = item.sourceContent ? contentHash(item.sourceContent) : null;
    const duplicate = hash && findDuplicate.get(hash, key);
    item.outcome = existing ? 'updated' : duplicate ? 'duplicate' : 'created';
    let entryId: number;
    if (existing) {
      entryId = existing.id;
      updateEntry.run(
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.cellAlpha,
        entry.cellBeta,
        entry.cellGamma,
        entry.cellVolume,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level,
        entry.sampleType,
        entry.crystalColour,
        entry.publTitle,
        entry.citationDoi,
        entry.databaseCodeCcdc,
        entry.databaseCodeCsd,
        entry.databaseCodeIcsd,
        entry.journalLanguage,
        entry.cellAAngstrom,
        entry.cellBAngstrom,
        entry.cellCAngstrom,
        entry.formulaUnitsZ,
        entry.radiationType,
        entry.radiationWavelengthAngstrom,
        entryId
      );
    } else {
      const info = insertEntry.run(
        sourceFilename,
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.cellAlpha,
        entry.cellBeta,
        entry.cellGamma,
        entry.cellVolume,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level,
        entry.sampleType,
        entry.crystalColour,
        entry.publTitle,
        entry.citationDoi,
        entry.databaseCodeCcdc,
        entry.databaseCodeCsd,
        entry.databaseCodeIcsd,
        entry.journalLanguage,
        entry.cellAAngstrom,
        entry.cellBAngstrom,
        entry.cellCAngstrom,
        entry.formulaUnitsZ,
        entry.radiationType,
        entry.radiationWavelengthAngstrom
      );
      entryId = Number(info.lastInsertRowid);
    }
    setIdentity.run(key, blockKey, sourceFilename, entryId);
    deleteElements.run(entryId);
    deleteAtomSites.run(entryId);
    deletePublAuthors.run(entryId);
    deleteDataAuthors.run(entryId);
    entry.dataAuthors?.forEach((author, index) => insertDataAuthor.run(entryId, index, author.name, author.address));
    deleteSymmetryOperations.run(entryId);
    deleteAtomSiteAnisotropic.run(entryId);
    for (const el of entry.elements) {
      insertElement.run(entryId, el.element, el.count);
    }
    entry.atomSites.forEach((site, index) => {
      insertAtomSite.run(
        entryId,
        index,
        site.typeSymbol,
        site.siteLabel,
        site.symmetryMultiplicity,
        site.wyckoffSymbol,
        site.fractX,
        site.fractY,
        site.fractZ,
        site.occupancy,
        site.uIsoOrEquiv,
        site.bIsoOrEquiv
      );
    });
    entry.publAuthors.forEach((author, index) => {
      insertPublAuthor.run(entryId, index, author.name, author.address);
    });
    entry.symmetryOperations.forEach((operation, index) => {
      insertSymmetryOperation.run(entryId, index, operation.operationId, operation.operationXyz);
    });
    entry.atomSiteAnisotropic.forEach((site, index) => {
      insertAtomSiteAnisotropic.run(
        entryId,
        index,
        site.siteLabel,
        site.u11,
        site.u22,
        site.u33,
        site.u12,
        site.u13,
        site.u23,
        site.b11,
        site.b22,
        site.b33,
        site.b12,
        site.b13,
        site.b23
      );
    });
    if (
      item.sourcePath !== undefined &&
      item.sourceMtimeMs !== undefined &&
      item.sourceSize !== undefined
    ) {
      if (hash) storeContent.run(hash, item.sourceContent);
      upsertFingerprint.run(
        entryId,
        sourceFilename,
        item.sourcePath,
        item.sourceMtimeMs,
        item.sourceSize,
        item.dataBlockIndex ?? 0,
        hash,
        item.blockHash ?? null
      );
    }
  };

  const writeBatchTransaction = database.transaction((items: EntryWriteItem[]) => {
    const failures: EntryWriteFailure[] = [];
    const groups = new Map<string, EntryWriteItem[]>();
    for (const item of items) {
      const key = item.sourcePath ? sourceKey(item.sourcePath) : `unlinked:${item.sourceFilename}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [key, group] of groups) {
      try {
        database.transaction(() => {
          for (const item of group) writeOne(item);
          // Reconciliation is in the same transaction as every block and its stored bytes.
          if (group.every(item => item.blockKey)) {
            const active = new Set(group.map(item => item.blockKey));
            for (const row of selectSourceEntries.all(key, group[0].sourcePath ?? key) as { id: number; block_key: string }[]) {
              if (!active.has(row.block_key)) deleteEntry.run(row.id);
            }
          }
        })();
      } catch (error) {
        for (const item of group) { delete item.outcome; failures.push({ item, error }); }
      }
    }
    return failures;
  });

  return {
    writeBatch: writeBatchTransaction,
    isUnchanged: (file) => {
      const rows = selectFingerprint.all(sourceKey(file.path)) as { content_hash: string | null; source_mtime_ms: number }[];
      if (!rows.length || rows.some(row => !row.content_hash || row.source_mtime_ms === -1)) return false;
      const hash = contentHash(readFileSync(file.path));
      return rows.every(row => row.content_hash === hash);
    }
  };
}

/** Clear stored sources together with their records. Original files are never touched. */
export function clearAllEntries(database: Database.Database = getDb()): number {
  return database.transaction(() => {
    const count = database.prepare('DELETE FROM entries').run().changes;
    database.prepare('DELETE FROM source_contents').run();
    return count;
  })();
}
