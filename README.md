# CIF Crystal Data

A local desktop database for crystallographic data extracted from CIF files, built with
Electron, React, TypeScript, Tailwind CSS, and better-sqlite3.

## Dev mode

```
npm install
npm run dev
```

This starts the Electron app with a live-reloading renderer.

## Importing CIF files

Click **Import CIFs...** in the toolbar, then choose a folder in the native folder picker.
The app recursively scans the folder for `*.cif` files, parses each one, and upserts it
into the local SQLite database (deduped by filename: reimporting a file with the same name
updates the existing row instead of duplicating it). Files that fail to parse are reported,
with filename and reason, in a dismissible results panel, without aborting the rest of the
batch.

## Building the packaged app

```
npm test          # Vitest unit tests (parser)
npm run typecheck # TypeScript, no emit
npm run build     # builds main/preload/renderer bundles
npm run package   # builds + runs electron-builder for Windows
```

`npm run package` produces a `release/win-unpacked` folder (runnable directly) plus an NSIS
installer and a portable executable, targeting Windows x64.

### Native module (better-sqlite3)

better-sqlite3 is a native Node addon and must be built against Electron's ABI, not the
system Node's. This is handled by `electron-rebuild` (via `postinstall`) for dev mode, and by
`electron-builder`'s built-in native dependency rebuild step when packaging.
