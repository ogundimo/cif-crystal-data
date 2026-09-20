# macOS installers

The macOS build configuration produces separate DMG installers and ZIP archives
for Apple Silicon (`arm64`) and Intel (`x64`). Each includes the PDF manual,
JSmol and a native Python/rietx runtime. Users do not need to install Python.

These builds must run on macOS. The configuration has been checked on Windows;
the first native build and installation checks are still required before calling
the Mac packages release-ready. The existing Windows installers are unchanged.

## Build both architectures with GitHub Actions

1. Commit and push the macOS support files together with the current application,
   `engine` sources, dependency lockfile and revised `docs` manual. The workflow
   builds the checked-out commit; it cannot include uncommitted local changes.
2. In GitHub, open **Actions → Build macOS installers → Run workflow** and select
   the branch containing those changes.
3. For an initial test build, leave **Sign with Developer ID and notarize with
   Apple** unchecked. Both architecture jobs run independently on native Macs.
4. After successful checks, download the `CIF-Crystal-Data-mac-arm64` and
   `CIF-Crystal-Data-mac-x64` artifacts. Each contains a DMG, ZIP and SHA-256 list.
   Artifacts are retained for 14 days; the workflow does not publish a release.

Use the `arm64` DMG on a Mac with an Apple chip and the `x64` DMG on an Intel Mac.
Open the disk image, drag **CIF Crystal Data** into **Applications**, and launch
the installed copy. The ZIP is an alternative app-bundle distribution.

## Developer ID signing and notarization

Unsigned test builds use an ad-hoc signature so Apple Silicon can execute their
native binaries. This does not establish publisher identity or notarize the app;
Gatekeeper can block a downloaded test build. Use a Developer ID certificate and
notarization for distribution to other users.

Configure repository Actions secrets before selecting the signed build option:

| Secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE` | Base64-encoded Developer ID Application certificate exported as a `.p12` file |
| `MACOS_CERTIFICATE_PASSWORD` | Password for that certificate export |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer team ID |

The workflow checks that all required secrets are present and verifies the
signature and notarization ticket. Configure secrets in GitHub, not in source
files or chat messages. The entitlement file supports Electron and the numerical
engine's JIT compilation and native libraries.

## Build locally on a Mac

Use native Node.js 22.12 or newer and uv 0.8.22 on the target architecture.
An Apple Silicon build requires native ARM Node.js, not Node under Rosetta.

```sh
npm ci
npm run setup:refinement:mac
npm test
npm run test:refinement
npm run package:mac
```

The setup script downloads Python 3.12.11 through uv, copies its complete
relocatable distribution into `.tools/rietx-runtime/python`, installs the pinned
scientific dependencies and rietx commit, and preserves licensing files. It
refuses to overwrite a Windows runtime or a runtime for another architecture;
use a clean checkout for each platform. If setup fails partway through, use a
fresh checkout rather than reusing the partial runtime.

Output names include the app version and architecture, for example
`CIF Crystal Data-1.1.0-mac-arm64.dmg`. The packaging command always builds the
host architecture and never publishes automatically. With `CSC_LINK` and the
Apple credentials above in the environment, it signs and notarizes; otherwise
it creates an ad-hoc-signed test build.

## Native verification

The workflow checks the bundled interpreter at its relocated path inside the
app, verifies code signatures, and runs the packaged application with an isolated
temporary profile. The smoke check covers the manual, CIF import/search/export,
rendering, all three refinement methods and database persistence after restart.

Before distributing a release, also install the DMG on a separate Mac for each
architecture, launch it from Applications, open the manual and run refinement.
This catches Gatekeeper, installation and display behavior that CI cannot fully
represent. The manual currently describes the Windows interface; these macOS
installation instructions supplement it.
