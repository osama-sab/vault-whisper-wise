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
