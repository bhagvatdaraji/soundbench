# SoundBench

A complete audio test & measurement toolkit that runs in the browser and installs on an iPhone's
Home Screen (PWA). No App Store, Xcode or Developer Mode needed.

**Live:** https://bhagvatdaraji.github.io/soundbench/

## Instruments

**Measure**
- **SPL Meter**: A/C/Z weighting, Fast/Slow/Impulse, Leq, Max, Min and Peak, analog dial
- **Level Meter**: dBFS peak (with hold), RMS, VU, crest factor, clip counter
- **SPL Logger**: LAeq / LAFmax / LCpeak every 1 s, 10 s or 1 min, plus L10/L90; keeps running in the background of the app
- **Traffic Light**: LAF or rolling 1/5/15-minute LAeq against a limit

**Analyze**
- **RTA**: 1/1 and 1/3 octave filter bank (IEC 61260-style)
- **FFT**: 4k–32k points, windows, smoothing, averaging, max hold, pink-flat view
- **SoundScope**: 1/48-octave spectrum plus scrolling spectrograph
- **Scope**: triggered waveform with frequency and level readouts
- **Distortion**: THD, THD+N and harmonics H2–H10

**Room & speakers**
- **Impulse / RT60**: log-sweep impulse response, ETC, Schroeder decay, EDT, T20, T30, C50, C80, D50, Ts per octave; IR export as WAV
- **LARSA**: time-gated (anechoic-style) speaker response
- **Transfer Function**: magnitude, phase and coherence against the phone's own output, a delay finder, and A/B delay memories for main/sub alignment
- **Polarity**: + / − check, using this phone as the source or listening to pulses from another device
- **STIPA** (experimental): speech transmission index

**Generate**: sine, square, triangle, pink/white noise, log sweep, Polarity and STIPA test signals.

**Setup**: Calibration (mic offset and speaker→mic latency), Saved measurements (CSV / image / WAV export through the share sheet), About & help with an FAQ.

Every instrument has a small ⓘ button with three quick steps and the questions that apply to it. Help text lives in `src/help/`.

## Use it on your iPhone

1. Open the link above in **Safari**.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen, pick an instrument, tap **Start microphone**, and allow mic access.
4. Go to **Setup › Calibration** once: set the level against a calibrator or a meter you trust, and measure the latency if you'll use delay or distance readings.

Every push to `main` is tested and redeployed automatically. Reopen the app to get the new version.

## Developing

```bash
npm install
npm run dev          # desktop browser at http://localhost:5173
npm run dev:phone    # HTTPS on your LAN; open https://<your-mac-ip>:5173 on the iPhone
npm test             # DSP unit tests (60): weighting vs IEC 61672, filters, FFT, RT60, STI…
npm run e2e          # browser tests (Playwright + Chromium) with a fake mic and loopback rooms
npm run build        # type-check + production build into dist/
```

### Loopback test mode

Add `?loopback=direct|room|invert|dist` to the URL and the "microphone" becomes the app's own output
played through a simulated path: `direct` is a 5 ms delay; `room` adds a 0.6 s RT60 reverb;
`invert` flips polarity; `dist` adds 1 % third-harmonic distortion. The e2e tests use it to check
every speaker→mic measurement, and it also works as a demo without a speaker.

### Changing the UI

- **Colors, fonts, sizes:** `src/theme/tokens.css` (graphs read the same variables).
- **Component styles:** `src/components/components.css`.
- **Shared pieces:** `src/components/` (dial, graph canvas and axes, module layout, controls, sheets).
- **Home screen grouping, order and help text:** `src/modules/index.ts`.
- **App name:** `src/config.ts`, `index.html`, `public/manifest.webmanifest`.

### Layout

```
src/
  dsp/            signal processing + unit tests (no browser APIs)
  audio/          AudioContext engine, worklets, play-and-record, loopback, shared measurements
  modules/<name>/ one folder per instrument
  components/     shared UI
  export/         CSV, WAV, share/download helpers
  store/          settings, calibration, saved measurements (localStorage / IndexedDB)
  theme/          design tokens
```

## Limits (vs. a native app)

- Accuracy depends on the mic and on Safari's audio path. Calibrate, and use an external measurement mic for serious work.
- Measuring stops when the screen locks or the app goes to the background.
- Safari exposes one input channel, so two-channel tools (Transfer Function, delay, polarity) use the phone's own output as the reference rather than a second input.
- STIPA is simplified (no masking, threshold or ambient-noise corrections) and not a certified STI measurement.
