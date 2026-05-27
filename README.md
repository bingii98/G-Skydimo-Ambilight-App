# G Skydimo Ambilight App

Desktop ambilight controller for **Skydimo LED strips** on Windows. Sync LED colors with your screen in real time, paint custom colors and gradients, run animations, calibrate LED zones, and connect over USB with auto-detection.

> **Disclaimer:** This is an independent open-source project. It is not affiliated with, endorsed by, or officially supported by Skydimo or any hardware manufacturer.

## Features

- **Screen ambilight** — capture desktop colors and map them to your LED strip
- **Color modes** — solid color, per-LED painting, gradients, and built-in animations
- **Zone calibration** — guided setup for strip orientation and LED layout
- **USB auto-connect** — detects Skydimo devices on CH340 serial ports
- **System tray** — optional background mode and launch at startup
- **Optional AI helpers** — gradient and animation suggestions via your own OpenAI API key (stored locally)

## Requirements

- **Windows 10/11**
- **Node.js 20+** and npm
- **Skydimo LED strip** connected via USB (CH340)
- Close the official **SkyDimo.exe** app before connecting — it locks the COM port

## Quick start

```bash
git clone https://github.com/bingii98/G-Skydimo-Ambilight-App.git
cd G-Skydimo-Ambilight-App
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and Electron together. The app loads from `http://localhost:5173` in development.

### Production build

```bash
npm run build
npm start
```

### Windows installer (.exe)

Build a setup installer for Windows (output in `release/`):

```bash
npm install
npm run dist
```

The installer file is named like `G Skydimo Ambilight App Setup 1.0.0.exe`. Run it to install the app with Start Menu and desktop shortcuts.

For an unpacked build folder (no installer), use `npm run pack`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev mode: Vite + Electron with hot reload |
| `npm run build` | Build the React UI into `dist/` |
| `npm start` | Build and launch Electron in production mode |
| `npm test` | Run unit tests (Vitest) |
| `npm run dev:main` | Restart Electron main process only (nodemon) |

## Supported LED models

LED counts are resolved automatically from the device ID when connected:

| Model | LEDs |
| --- | ---: |
| SK0L27 | 96 |
| SK0L24 | 80 |
| SK0L32 | 114 |
| SK0L34 | 112 |
| SK0L21 | 76 |
| SK0127 | 67 |

## Optional: OpenAI API key

AI features are **optional**. To use gradient or animation suggestions:

1. Open **Settings** in the app sidebar
2. Paste your [OpenAI API key](https://platform.openai.com/api-keys)
3. Use the AI buttons in the gradient editor or animation panel

The key is saved in local browser storage only and sent directly from the app to OpenAI when you request a suggestion.

## Project structure

```
├── main.js              # Electron main process
├── preload.js           # IPC bridge to renderer
├── connectionManager.js # USB scan, connect, LED streaming
├── skydimo.js           # Serial protocol and device helpers
├── appInfo.js           # App name and description constants
├── services/            # OpenAI suggestion handlers (main process)
└── src/                 # React UI (Vite)
    ├── App.jsx
    ├── components/
    ├── hooks/
    └── lib/
```

## Fork & contribute

Contributions and forks are welcome.

1. **Fork** this repository on GitHub
2. **Create a branch** for your change
3. **Run tests** with `npm test`
4. **Open a pull request** with a clear description of what changed and why

If you publish a fork, please keep the MIT license and attribution. You may rename the app in `appInfo.js`, but do not imply official Skydimo endorsement.

## Troubleshooting

| Issue | What to try |
| --- | --- |
| COM port busy | Quit SkyDimo.exe and any other app using the port, then scan again |
| No device found | Check the USB cable, try another port, click **Scan** |
| App won't start after edits | Restart `npm run dev` so nodemon reloads `main.js` |

## License

[MIT](LICENSE) — free to use, modify, and distribute. See `LICENSE` for the full text.
