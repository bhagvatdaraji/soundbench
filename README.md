# SoundBench

A personal audio test & measurement app that runs in the browser and installs on an
iPhone's Home Screen (PWA). No App Store, Xcode or Developer Mode needed.

**Instruments:** SPL meter (A/C/Z, Fast/Slow/Impulse, Leq/Max/Min/Peak, analog dial) ·
RTA (1/1 and 1/3 octave filter bank) · FFT analyzer (4k–32k points, windows, smoothing,
max hold, pink-flat view) · Signal generator (sine, square, triangle, pink, white, log sweep) ·
Calibration.

## Use it on your iPhone

1. Open the GitHub Pages URL in **Safari** (Settings › Pages on GitHub shows it).
2. Share button → **Add to Home Screen**.
3. Open it from the Home Screen, pick an instrument, tap **Start microphone**, and allow mic access.
4. Go to **Calibration** once (see below). Until then readings are marked *Uncalibrated*.

Every push to `main` redeploys automatically. Pull to refresh (or reopen the app) to get the new version.

## Calibration

Readings are `dBFS + offset`. The default offset (120 dB) is only a rough guess for iPhone mics.
To calibrate, play a 94 dB / 1 kHz acoustic calibrator into the mic, or place the phone next to a
meter you trust with steady pink noise playing. Wait for the reading to settle, enter the true
level and tap **Set**. You can fine-tune ±0.1 / ±1 dB.

The Calibration screen also shows whether Safari honoured the request to turn off echo
cancellation, noise suppression and auto gain. If any show **ON**, readings will be less reliable.

## Developing

```bash
npm install
npm run dev          # desktop browser at http://localhost:5173
npm run dev:phone    # HTTPS on your LAN; open https://<your-mac-ip>:5173 on the iPhone
                     # (accept the self-signed certificate warning once)
npm test             # DSP unit tests (weighting vs IEC 61672, band filters, FFT, generator)
npm run build        # type-check + production build into dist/
```

### Changing the UI

- **Colors, fonts, sizes:** `src/theme/tokens.css`. Graphs read the same variables.
- **Component styles:** `src/components/components.css`.
- **Shared pieces:** `src/components/` (`AnalogDial`, `GraphCanvas` + `graph.ts`, `ModuleScreen`,
  `ui.tsx` for segmented controls, readouts, sheets, tool buttons).
- **Home screen tiles / order:** `src/modules/index.ts`.
- **App name:** `src/config.ts`, `index.html`, `public/manifest.webmanifest`.

### Layout

```
src/
  dsp/            pure signal-processing code + tests (no browser APIs)
  audio/          AudioContext engine and AudioWorklet processors
  modules/<name>/ one folder per instrument screen
  components/     shared UI
  theme/          design tokens
  store/          persisted settings and calibration (localStorage)
```

Real-time DSP (weighting, time constants, RTA filters, generator) runs in AudioWorklets.
The FFT runs on the main thread from captured audio blocks.

## Known limits (vs. a native app)

- Measurement accuracy depends on how Safari handles the mic. Calibrate before trusting absolute levels.
- Measuring stops when the screen locks or the app goes to the background.
- Two-input measurements (transfer function, X-Y scope) are not reliable in Safari.

## Roadmap

Scope → save/export (CSV/PNG) → SoundScope (1/48 oct + spectrograph) → SPL logger & traffic
light → impulse response / RT60 → polarity → transfer function.
