# Pocket Money — Desktop App

## How to build the Windows EXE

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later

### Steps
1. Double-click `build-windows.bat`
2. Wait ~3–5 minutes (downloads Electron ~80 MB on first run)
3. Your app appears in: `release\Pocket Money-win32-x64\`
4. Run `Pocket Money.exe` inside that folder

> **No installer** — just copy the `Pocket Money-win32-x64` folder anywhere and run the .exe directly.

### Other platforms
```bash
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

---

## Working on this app

```bash
npm install --legacy-peer-deps   # plugin-react-swc has not widened its peer range to vite 8
npm test                         # 48 tests
npm run dev                      # browser, hot reload
npm run electron                 # the desktop app against the built dist/
```

### Installing a new build over the installed app

The copy in `C:\Program Files` ships only the compiled bundle — the packaging
script passes `--ignore=src` — and writing there needs elevation:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

It builds, closes a running instance, keeps a rollback copy in
`resources\app.backup`, and replaces `dist\` and `electron\main.cjs`.
Your transactions are in IndexedDB under your user profile and are not touched.

### Things worth knowing

- **Dates are never round-tripped through `Date`.** A stored date is a
  `yyyy-mm-dd` string and months are compared by string prefix; `new Date("2026-04-01")`
  parses as UTC midnight and shifts the day for anyone west of UTC. Use the
  helpers in `src/lib/format.ts`.
- **Month arithmetic lives in `src/lib/budget.ts`,** and nowhere else. A
  subscription is a forecast that a real transaction fulfils — never add both.
- **Merchant keywords match on word boundaries.** Adding a short keyword like
  `ing` or `real` is safe now, but keep them specific anyway.
- **jsPDF's standard font is WinAnsi-encoded.** `−` (U+2212), `–` and smart
  quotes render as stray glyphs; stick to ASCII in PDF strings.
