# Pocket Money — Desktop App

A local-first budget and expense tracker. Everything stays on your machine;
nothing is uploaded.

## Installing

Download or build `Pocket Money Setup <version>.exe` and double-click it. The
installer asks whether to install **for everyone** on the PC (needs admin once)
or **just for you** (no admin prompt at all), then creates Start-menu and
desktop shortcuts and registers an uninstaller in Add/Remove Programs.

> The installer is **not code-signed**, so Windows SmartScreen shows
> *"Windows protected your PC"* the first time. Click **More info → Run anyway**.
> Removing that warning requires a paid code-signing certificate.

Your data lives in `%APPDATA%\pocket-money` and is never touched by installing,
upgrading or uninstalling.

## Building it

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later

```bash
npm install --legacy-peer-deps   # plugin-react-swc hasn't widened its peer range to vite 8
npm run dist                     # -> release/Pocket Money Setup <version>.exe
```

The first run downloads Electron (~80 MB). Other targets:

```bash
npm run dist:dir     # unpacked build only, for quick testing
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

---

## Working on this app

```bash
npm test          # 56 tests
npm run dev       # browser, hot reload
npm run electron  # the desktop app against the built dist/
```

### Things worth knowing

- **Dates are never round-tripped through `Date`.** A stored date is a
  `yyyy-mm-dd` string and months are compared by string prefix;
  `new Date("2026-04-01")` parses as UTC midnight and shifts the day for anyone
  west of UTC. Use the helpers in `src/lib/format.ts`.
- **Month arithmetic lives in `src/lib/budget.ts`,** and nowhere else. A
  subscription is a forecast that a real transaction fulfils — never add both.
- **Merchant keywords match on word boundaries.** Adding a short keyword like
  `ing` or `real` is safe now, but keep them specific anyway.
- **jsPDF's standard font is WinAnsi-encoded.** `−` (U+2212), `–` and smart
  quotes render as stray glyphs; stick to ASCII in PDF strings.
- **PDF tables go through `tableFor()` in `src/lib/pdf.ts`.** jspdf-autotable
  applies `columnStyles` to body cells only, so head and foot alignment has to
  be reapplied — that helper is the single place it happens.
- **`productName` belongs in the `build` block, not at the root of
  `package.json`.** At the root it changes `app.getName()`, which moves
  `app.getPath('userData')` and makes the app open with no data.
  `electron/main.cjs` also pins the path explicitly.
- **`node_modules` is excluded from the package.** Vite bundles the renderer
  into `dist/`, and `electron/main.cjs` uses only built-in modules. Without the
  exclusion the asar goes from 1.8 MB to 166 MB.
