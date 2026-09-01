# CIF Crystal Data

A local desktop database for crystallographic data extracted from CIF files, built with
Electron, React, TypeScript, Tailwind CSS, and better-sqlite3.

Released under the [MIT License](LICENSE).

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

## Local crystal viewer

The compound details workspace includes a reusable JSmol 16.4.15 HTML5 viewer.
The pinned runtime is packaged under `dist/vendor/jsmol`; it does not use a CDN,
PHP relay, remote rendering service, tracking endpoint, or database-loading URL.

The Electron security boundary remains unchanged: context isolation is enabled
and Node integration is disabled. The preload bridge exposes only
`getViewerSource(entryId)`, which validates the database entry in the main
process and returns the original CIF text plus its filename. Renderer and JSmol
code receive neither source paths nor general filesystem access. JSmol requires
`unsafe-eval` in the renderer CSP for its Java-to-JavaScript class runtime; the
policy continues to disallow remote scripts, inline scripts, and object content.
The generated one-line applet bootstrap handler is removed and invoked from the
trusted runtime adapter so `script-src 'unsafe-inline'` is not required.

Third-party licence text and notices are packaged from `third_party/`.

### Native module (better-sqlite3)

better-sqlite3 is a native Node addon and must be built against Electron's ABI, not the
system Node's. The `postinstall` script and packaging both use `electron-builder`'s native
dependency rebuild step.

## Publishing a GitHub release

The `Release Windows application` GitHub Actions workflow publishes the NSIS installer,
portable executable, `SHA256SUMS.txt`, and a CycloneDX SBOM. It runs the complete test suite
before packaging, creates a signed GitHub artifact attestation when the repository is public,
and retains the same files as a workflow artifact for 14 days. GitHub does not offer artifact
attestations for user-owned private repositories.

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

The generated Windows executables are unsigned unless the protected
`WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` repository secrets are configured.
The workflow verifies every configured signature and fails instead of publishing an invalid
one. Unsigned builds may trigger a Windows SmartScreen warning.
