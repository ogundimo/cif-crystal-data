# CIF Crystal Data

A local desktop database for crystallographic data extracted from CIF files, built with
Electron, React, TypeScript, Tailwind CSS, and better-sqlite3.

## Dev mode

Development requires Node.js 22.12 or newer.

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

The selected folder is remembered. Click **Refresh CIFs** to scan that folder again without
choosing it again. The refresh compares each file's path, modification time, and size, so
unchanged files are skipped while new or modified CIFs are parsed and upserted.

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
system Node's. The `postinstall` script and packaging both use `electron-builder`'s native
dependency rebuild step.

## Publishing a GitHub release

The `Release Windows application` GitHub Actions workflow publishes the NSIS installer,
portable executable, and a `SHA256SUMS.txt` file. It runs the complete test suite before
packaging and retains the same files as a workflow artifact for 14 days.

To publish a release:

1. Update `version` in `package.json` and `package-lock.json`, then commit the change.
2. Create a matching semantic-version tag, such as `v1.1.0`:

   ```powershell
   git tag v1.1.0
   git push origin main v1.1.0
   ```

3. The tag push starts the release workflow. GitHub generates the release notes and attaches
   both Windows executables and their checksums.

The workflow can also be run manually from the Actions tab for an existing tag. Manual runs
do not create tags, and the workflow fails if the tag version differs from `package.json`.
Tags containing a prerelease suffix, such as `v1.2.0-beta.1`, create GitHub prereleases.

The generated Windows executables are currently unsigned, so Windows SmartScreen may warn
users until a code-signing certificate is configured for `electron-builder`.
