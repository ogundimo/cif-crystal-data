import type Database from 'better-sqlite3';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import { contentHash } from './sourceIdentity';

/** Called within the snapshotted schema-migration transaction. Updates metadata only. */
export function migrateBibliography(database: Database.Database): void {
  database.exec(`CREATE TABLE data_authors (
    id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    author_order INTEGER NOT NULL, name TEXT NOT NULL, address TEXT,
    UNIQUE(entry_id, author_order));`);
  const sources = database.prepare('SELECT DISTINCT content_hash FROM imported_files WHERE content_hash IS NOT NULL').all() as { content_hash: string }[];
  const contents = database.prepare('SELECT content FROM source_contents WHERE hash = ?');
  const associations = database.prepare('SELECT entry_id, block_hash, data_block_index FROM imported_files WHERE content_hash = ?');
  const update = database.prepare('UPDATE entries SET reference = ?, publ_title = ?, citation_doi = ? WHERE id = ?');
  const remove = database.prepare('DELETE FROM publ_authors WHERE entry_id = ?');
  const publication = database.prepare('INSERT INTO publ_authors(entry_id, author_order, name, address) VALUES (?, ?, ?, ?)');
  const data = database.prepare('INSERT INTO data_authors(entry_id, author_order, name, address) VALUES (?, ?, ?, ?)');
  for (const source of sources) {
    const stored = contents.get(source.content_hash) as { content: Buffer } | undefined;
    if (!stored || contentHash(stored.content) !== source.content_hash) throw new Error('Stored source checksum failed during bibliography repair');
    const blocks = splitCifDataBlocks(stored.content.toString('utf8'));
    const parsed = new Map<number, ReturnType<typeof parseCif>>();
    const rows = associations.all(source.content_hash) as { entry_id: number; block_hash: string; data_block_index: number }[];
    for (const row of rows) {
      const block = blocks[row.data_block_index];
      if (!block || contentHash(block.text) !== row.block_hash) throw new Error(`Stored block checksum failed for entry ${row.entry_id}`);
      let entry = parsed.get(row.data_block_index);
      if (!entry) { entry = parseCif(block.text); parsed.set(row.data_block_index, entry); }
      update.run(entry.reference, entry.publTitle, entry.citationDoi, row.entry_id);
      remove.run(row.entry_id);
      entry.publAuthors.forEach((author, index) => publication.run(row.entry_id, index, author.name, author.address));
      entry.dataAuthors?.forEach((author, index) => data.run(row.entry_id, index, author.name, author.address));
    }
  }
}
