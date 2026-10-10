import { useSyncExternalStore } from 'react';
import type { BandResolution } from '../dsp/bands';
import { DEFAULT_GENERATOR, type GeneratorParams } from '../dsp/generators';
import { load, save } from '../store/persist';
import { setActiveMic } from '../store/calibration';
import { buildLoopback, loopbackMode, type LoopbackMode } from './loopback';
import type { AnalyzerCommand, AnalyzerEvent, GeneratorCommand, GeneratorEvent } from './messages';
import analyzerUrl from './worklets/analyzer.worklet.ts?worker&url';
import generatorUrl from './worklets/generator.worklet.ts?worker&url';

export type MicState = 'off' | 'starting' | 'on' | 'error';

export interface AudioInput {
  id: string;
  label: string;
}

/** Which channel of a multi-channel input to measure; 'mix' averages them (the default). */
export type InputChannel = 'mix' | 0 | 1;

export interface EngineStatus {
  mic: MicState;
  error: string | null;
  sampleRate: number | null;
  /** What the browser reports it actually applied to the mic track. */
  trackSettings: MediaTrackSettings | null;
  generatorRunning: boolean;
  generator: GeneratorParams;
  /** Audio inputs the browser reports (names appear after mic permission). */
  inputs: AudioInput[];
  /** False until the browser reveals device names (i.e. before mic permission). */
  inputsNamed: boolean;
  /** Chosen input device, or null for the system default. */
  inputId: string | null;
  inputChannel: InputChannel;
  /** Name of the input actually in use. */
  inputLabel: string | null;
  /** Channels the current input can deliver (1 if unknown). */
  inputChannels: number;
  /** Non-fatal notice, e.g. the saved input is no longer connected. */
  notice: string | null;
}

type Listener<T> = (e: T) => void;
type EventMap = {
  spl: Extract<AnalyzerEvent, { type: 'spl' }>;
  rta: Extract<AnalyzerEvent, { type: 'rta' }>;
  capture: Extract<AnalyzerEvent, { type: 'capture' }>;
  ref: GeneratorEvent;
};

/**
 * Owns the AudioContext, mic input, analyzer worklet and generator worklet.
 * Modules subscribe to analyzer events; the UI reads status via useEngineStatus().
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private ready: Promise<void> | null = null;
  private analyzer: AudioWorkletNode | null = null;
  private generator: AudioWorkletNode | null = null;
  /** Everything the app plays goes through here (generator, measurement signals). */
  private out: GainNode | null = null;
  /** Set when the app was opened with ?loopback=… (simulated mic, see loopback.ts). */
  readonly loopback: LoopbackMode | null = loopbackMode();
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  private loopbackIn: AudioNode | null = null;
  private splitter: AudioNode | null = null;
  private stoppingOnPurpose = false;
  private wakeLock: { release(): Promise<void> } | null = null;
  private listeners: { [K in keyof EventMap]: Set<Listener<EventMap[K]>> } = {
    spl: new Set(),
    rta: new Set(),
    capture: new Set(),
    ref: new Set(),
  };
  private statusListeners = new Set<() => void>();
  private rtaUsers = new Map<symbol, BandResolution>();
  private captureUsers = new Set<symbol>();
  private refUsers = new Set<symbol>();

  status: EngineStatus = {
    mic: 'off',
    error: null,
    sampleRate: null,
    trackSettings: null,
    generatorRunning: false,
    generator: load('generator', DEFAULT_GENERATOR),
    inputs: [],
    inputsNamed: false,
    inputId: load<string | null>('inputId', null),
    inputChannel: load<InputChannel>('inputChannel', 'mix'),
    inputLabel: null,
    inputChannels: 1,
    notice: null,
  };

  constructor() {
    navigator.mediaDevices?.addEventListener?.('devicechange', () => void this.refreshInputs());
    // names are already visible if mic permission was granted earlier (lets the start card offer a choice)
    void this.refreshInputs();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (this.status.mic === 'on') void this.acquireWakeLock();
        const ctx = this.ctx;
        // iOS reports 'interrupted' after a phone call or Siri.
        if (ctx && (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted')) {
          void ctx.resume();
        }
      }
    });
  }

  private setStatus(p: Partial<EngineStatus>) {
    this.status = { ...this.status, ...p };
    this.statusListeners.forEach((l) => l());
  }

  subscribeStatus = (cb: () => void) => {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  };

  on<K extends keyof EventMap>(type: K, cb: Listener<EventMap[K]>): () => void {
    this.listeners[type].add(cb);
    return () => this.listeners[type].delete(cb);
  }

  /** Creates the AudioContext and loads worklets. Must first run inside a user tap on iOS. */
  private ensureContext(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.resume();
      return this.ready!;
    }
    // iOS 16.4+: let mic and speaker run together at full volume.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'play-and-record';
    // Use the device's own rate (48 kHz on iPhones): forcing a rate that differs from the
    // mic's makes Safari resample or refuse to connect the mic. DSP adapts to any rate.
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    void ctx.resume();
    this.ready = (async () => {
      await ctx.audioWorklet.addModule(analyzerUrl);
      await ctx.audioWorklet.addModule(generatorUrl);
      this.generator = new AudioWorkletNode(ctx, 'soundbench-generator', {
        numberOfInputs: 0,
        outputChannelCount: [2],
      });
      this.out = ctx.createGain();
      this.out.connect(ctx.destination);
      this.generator.connect(this.out);
      this.generator.port.onmessage = (e: MessageEvent<GeneratorEvent>) => {
        this.listeners.ref.forEach((l) => l(e.data));
      };
      this.setStatus({ sampleRate: ctx.sampleRate });
      this.sendGenerator();
      this.syncRef();
    })();
    return this.ready;
  }

  async startMic(): Promise<void> {
    if (this.status.mic === 'on' || this.status.mic === 'starting') return;
    this.setStatus({ mic: 'starting', error: null, notice: null });
    try {
      const ready = this.ensureContext();
      let stream: MediaStream | null = null;
      if (!this.loopback) {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone needs HTTPS. Open the app from its https:// address.');
        }
        stream = await this.openInput();
      }
      await ready;
      const ctx = this.ctx!;
      this.stream = stream;
      if (stream) {
        this.source = ctx.createMediaStreamSource(stream);
        const ch = this.status.inputChannel;
        const n = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1;
        if (ch !== 'mix' && n > 1) {
          // measure one input of a multi-channel interface instead of the average of all
          const split = ctx.createChannelSplitter(n);
          this.source.connect(split);
          const pick = ctx.createGain();
          split.connect(pick, Math.min(ch, n - 1));
          this.splitter = split;
          this.source = pick;
        }
      } else {
        const lb = buildLoopback(ctx, this.out!, this.loopback!);
        this.loopbackIn = lb.input;
        this.source = lb.output;
      }
      this.analyzer = new AudioWorkletNode(ctx, 'soundbench-analyzer', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      this.analyzer.port.onmessage = (e: MessageEvent<AnalyzerEvent>) => {
        const msg = e.data;
        (this.listeners[msg.type] as Set<Listener<AnalyzerEvent>>).forEach((l) => l(msg));
      };
      // Keep the node pulled by the graph without making any sound.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      this.source.connect(this.analyzer).connect(mute).connect(ctx.destination);
      this.syncAnalyzer();
      await this.acquireWakeLock();
      const track = stream?.getAudioTracks()[0];
      track?.addEventListener('ended', () => {
        if (this.stoppingOnPurpose) return;
        this.stopMic();
        this.setStatus({ notice: 'The microphone was disconnected. Tap Start microphone to continue.' });
      });
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities;
      const label = track?.label || (this.loopback ? `Loopback (${this.loopback})` : 'Microphone');
      setActiveMic(label);
      this.setStatus({
        mic: 'on',
        trackSettings: track?.getSettings() ?? null,
        inputLabel: label,
        inputChannels: Math.max(track?.getSettings().channelCount ?? 1, caps.channelCount?.max ?? 1),
      });
      void this.refreshInputs();
    } catch (err) {
      const e = err as Error & { name?: string };
      const message =
        e.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in Settings › Safari › Microphone (or the site settings), then try again.'
          : e.message || String(err);
      this.stopMic();
      this.setStatus({ mic: 'error', error: message });
    }
  }

  stopMic(): void {
    this.stoppingOnPurpose = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stoppingOnPurpose = false;
    this.splitter?.disconnect();
    this.splitter = null;
    this.source?.disconnect();
    this.analyzer?.disconnect();
    if (this.loopbackIn) this.out?.disconnect(this.loopbackIn);
    this.loopbackIn = null;
    this.stream = null;
    this.source = null;
    this.analyzer = null;
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if (this.status.mic !== 'off') this.setStatus({ mic: 'off', trackSettings: null });
  }

  private async acquireWakeLock() {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (wl) this.wakeLock = await wl.request('screen');
    } catch {
      // Not supported or not allowed; the screen may dim during long measurements.
    }
  }

  /** Opens the chosen input; falls back to the system default if it's gone. */
  private async openInput(): Promise<MediaStream> {
    const audio = (deviceId: string | null): MediaTrackConstraints => ({
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // a specific channel needs all channels delivered; otherwise ask for mono as before
      channelCount: this.status.inputChannel === 'mix' ? 1 : { ideal: 2 },
    });
    let id = this.status.inputId;
    const wanted = load<string | null>('inputLabel', null);
    if (!id) return navigator.mediaDevices.getUserMedia({ audio: audio(null) });

    // Browsers may hand out new device ids between sessions: find the device by name if so.
    const findByName = async () => {
      const list = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      return list.find((d) => d.kind === 'audioinput' && d.label && d.label === wanted)?.deviceId ?? null;
    };
    const remember = (newId: string) => {
      id = newId;
      save('inputId', newId);
      this.setStatus({ inputId: newId });
    };
    if (wanted) {
      const byName = await findByName();
      if (byName && byName !== id) remember(byName);
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audio(id) });
    } catch (e) {
      const name = (e as Error).name;
      if (name !== 'OverconstrainedError' && name !== 'NotFoundError' && name !== 'NotReadableError') throw e;
      // Names are only visible once permission is granted: open the default, then look again.
      const fallback = await navigator.mediaDevices.getUserMedia({ audio: audio(null) });
      const byName = wanted ? await findByName() : null;
      if (byName) {
        fallback.getTracks().forEach((t) => t.stop());
        remember(byName);
        return navigator.mediaDevices.getUserMedia({ audio: audio(byName) });
      }
      this.setStatus({ notice: 'The chosen microphone isn’t connected; using the default one.' });
      return fallback;
    }
  }

  /** Re-reads the list of audio inputs (on start and whenever devices are plugged in or out). */
  async refreshInputs(): Promise<void> {
    if (this.loopback || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const devs = all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
      const inputs = devs.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      // keep the saved choice when the browser has given the device a new id
      let inputId = this.status.inputId;
      const wanted = load<string | null>('inputLabel', null);
      if (inputId && wanted && !inputs.some((i) => i.id === inputId)) {
        const byName = devs.find((d) => d.label === wanted);
        if (byName) {
          inputId = byName.deviceId;
          save('inputId', inputId);
        }
      }
      this.setStatus({ inputs, inputId, inputsNamed: devs.length > 0 && devs.every((d) => d.label) });
    } catch {
      // not supported; the picker just stays hidden
    }
  }

  /** Switches to another input (null = system default); restarts the mic if it's running. */
  async setInput(id: string | null): Promise<void> {
    save('inputId', id);
    save('inputLabel', id ? this.status.inputs.find((i) => i.id === id)?.label ?? null : null);
    this.setStatus({ inputId: id, notice: null });
    await this.restartMic();
  }

  async setInputChannel(ch: InputChannel): Promise<void> {
    save('inputChannel', ch);
    this.setStatus({ inputChannel: ch });
    await this.restartMic();
  }

  private async restartMic() {
    if (this.status.mic !== 'on') return;
    this.stopMic();
    await this.startMic();
  }

  /** Register interest in the RTA filter bank; returns an unsubscribe. */
  useRta(resolution: BandResolution): () => void {
    const id = Symbol('rta');
    this.rtaUsers.set(id, resolution);
    this.syncAnalyzer();
    return () => {
      this.rtaUsers.delete(id);
      this.syncAnalyzer();
    };
  }

  /** Register interest in raw capture blocks; returns an unsubscribe. */
  useCapture(): () => void {
    const id = Symbol('capture');
    this.captureUsers.add(id);
    this.syncAnalyzer();
    return () => {
      this.captureUsers.delete(id);
      this.syncAnalyzer();
    };
  }

  /** Register interest in the generator's played samples (Transfer Function reference). */
  useRefCapture(): () => void {
    const id = Symbol('ref');
    this.refUsers.add(id);
    this.syncRef();
    return () => {
      this.refUsers.delete(id);
      this.syncRef();
    };
  }

  private syncRef() {
    const cmd: GeneratorCommand = { type: 'captureRef', enabled: this.refUsers.size > 0 };
    this.generator?.port.postMessage(cmd);
  }

  /** The running AudioContext and output bus, for measurement playback (see measure.ts). */
  get audio(): { ctx: AudioContext; out: GainNode } | null {
    return this.ctx && this.out ? { ctx: this.ctx, out: this.out } : null;
  }

  private syncAnalyzer() {
    if (!this.analyzer) return;
    const resolutions = [...this.rtaUsers.values()];
    const rta: AnalyzerCommand = { type: 'rta', resolution: resolutions.at(-1) ?? null };
    const cap: AnalyzerCommand = { type: 'capture', enabled: this.captureUsers.size > 0 };
    this.analyzer.port.postMessage(rta);
    this.analyzer.port.postMessage(cap);
  }

  setGenerator(params: Partial<GeneratorParams>): void {
    const generator = { ...this.status.generator, ...params };
    save('generator', generator);
    this.setStatus({ generator });
    this.sendGenerator();
  }

  async setGeneratorRunning(running: boolean): Promise<void> {
    if (running) await this.ensureContext();
    this.setStatus({ generatorRunning: running });
    this.sendGenerator();
  }

  private sendGenerator() {
    const cmd: GeneratorCommand = {
      type: 'set',
      params: this.status.generator,
      running: this.status.generatorRunning,
    };
    this.generator?.port.postMessage(cmd);
  }
}

export const engine = new AudioEngine();

export function useEngineStatus(): EngineStatus {
  return useSyncExternalStore(engine.subscribeStatus, () => engine.status);
}
