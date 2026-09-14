import type Database from 'better-sqlite3';
import type { CifEntry } from '../../parser/cifParser';
import { getDb } from './connection';

export interface EntryWriteItem {
  sourceFilename: string;
  sourcePath?: string;
  sourceMtimeMs?: number;
  sourceSize?: number;
  dataBlockIndex?: number;
  recordFingerprint?: boolean;
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
  removeStaleSourceEntries?: (sourcePath: string, activeSourceFilenames: string[]) => void;
}

/** Prepare one reusable writer whose batches commit once while each file remains atomic. */
export function createEntryWriter(database: Database.Database = getDb()): EntryWriter {
  const selectEntry = database.prepare('SELECT id FROM entries WHERE source_filename = ?');
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
  const selectFingerprint = database.prepare(
    `SELECT 1 FROM imported_files
     WHERE source_path = ? AND source_mtime_ms = ? AND source_size = ?`
  );
  const invalidateSource = database.prepare(
    'UPDATE imported_files SET source_mtime_ms = -1 WHERE source_path = ?'
  );
  const upsertFingerprint = database.prepare(
    `INSERT INTO imported_files (source_filename, source_path, source_mtime_ms, source_size, data_block_index)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_filename) DO UPDATE SET source_path = excluded.source_path,
       source_mtime_ms = excluded.source_mtime_ms, source_size = excluded.source_size,
       data_block_index = excluded.data_block_index`
  );
  const selectSourceEntries = database.prepare(
    'SELECT source_filename FROM imported_files WHERE source_path = ?'
  );
  const deleteEntry = database.prepare('DELETE FROM entries WHERE source_filename = ?');

  const writeOne = database.transaction((item: EntryWriteItem) => {
    const { sourceFilename, entry } = item;
    const existing = selectEntry.get(sourceFilename) as { id: number } | undefined;
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
    deleteElements.run(entryId);
    deleteAtomSites.run(entryId);
    deletePublAuthors.run(entryId);
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
      upsertFingerprint.run(
        sourceFilename,
        item.sourcePath,
        item.recordFingerprint === false ? -1 : item.sourceMtimeMs,
        item.sourceSize,
        item.dataBlockIndex ?? 0
      );
    }
  });

  const writeBatchTransaction = database.transaction((items: EntryWriteItem[]) => {
    const failures: EntryWriteFailure[] = [];
    for (const item of items) {
      try {
        // Nested better-sqlite3 transactions use savepoints, preserving per-file atomicity.
        writeOne(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
    // A physical file is complete only if every block was written successfully.
    for (const failure of failures) {
      if (failure.item.sourcePath !== undefined) invalidateSource.run(failure.item.sourcePath);
    }
    return failures;
  });

  return {
    writeBatch: writeBatchTransaction,
    isUnchanged: (file) => Boolean(selectFingerprint.get(file.path, file.mtimeMs, file.size)),
    removeStaleSourceEntries: database.transaction((sourcePath: string, activeSourceFilenames: string[]) => {
      const active = new Set(activeSourceFilenames);
      const rows = selectSourceEntries.all(sourcePath) as { source_filename: string }[];
      for (const row of rows) {
        if (!active.has(row.source_filename)) deleteEntry.run(row.source_filename);
      }
    })
  };
}

/** Delete all imported CIF data in one transaction. Cascades remove entry_elements rows. */
export function clearAllEntries(database: Database.Database = getDb()): number {
  return database.transaction(() => database.prepare('DELETE FROM entries').run().changes)();
}
