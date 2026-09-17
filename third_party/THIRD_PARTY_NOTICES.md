# Third-party notices

## Gemmi 0.7.5 / IT92 neutral-atom coefficients

`src/shared/it92.json` contains the neutral-atom coefficient table extracted with
Gemmi 0.7.5, retaining its single-precision values. The source table is Copyright
2019 Global Phasing Ltd. and distributed under Mozilla Public License 2.0.
The corresponding upstream source and license are included in `gemmi/it92.hpp`
and `gemmi/LICENSE.txt`. This derived JSON table is available under MPL-2.0;
its source is also available in the application's repository at the path above.
Upstream: https://github.com/project-gemmi/gemmi/tree/v0.7.5.

The table uses four Gaussians plus a constant from International Tables for
Crystallography Volume C (1992 or later). Gemmi is used separately to generate
synthetic validation references; its Python library is not an application dependency.

## Jmol / JSmol 16.4.15

This application includes the unmodified JSmol HTML5 runtime from Jmol 16.4.15:
`JSmol.min.js`, the complete `j2s` directory, and the upstream `README.TXT`.

JSmol is Copyright © the Jmol/JSmol authors and contributors and is distributed
under the GNU Lesser General Public License version 2.1 only. The complete
licence text is included in `LICENSE-JSMOL-LGPL-2.1.txt`. Corresponding source is
available from the upstream Jmol 16.4.15 release on SourceForge.

The runtime is used in local HTML5 canvas mode. This application does not use
the Java applet, PHP relay, remote rendering, tracking, or remote database
loading. JSmol 16.4.15 is intentionally pinned and has not been silently
upgraded.
