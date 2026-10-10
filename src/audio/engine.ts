import { useSyncExternalStore } from 'react';
import type { BandResolution } from '../dsp/bands';
import { DEFAULT_GENERATOR, type GeneratorParams } from '../dsp/generators';
import { load, save } from '../store/persist';
import type { AnalyzerCommand, AnalyzerEvent, GeneratorCommand } from './messages';
import analyzerUrl from './worklets/analyzer.worklet.ts?worker&url';
import generatorUrl from './worklets/generator.worklet.ts?worker&url';

export type MicState = 'off' | 'starting' | 'on' | 'error';

export interface EngineStatus {
  mic: MicState;
  error: string | null;
  sampleRate: number | null;
  /** What the browser reports it actually applied to the mic track. */
  trackSettings: MediaTrackSettings | null;
  generatorRunning: boolean;
  generator: GeneratorParams;
}

type Listener<T> = (e: T) => void;
type EventMap = {
  spl: Extract<AnalyzerEvent, { type: 'spl' }>;
  rta: Extract<AnalyzerEvent, { type: 'rta' }>;
  capture: Extract<AnalyzerEvent, { type: 'capture' }>;
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
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private listeners: { [K in keyof EventMap]: Set<Listener<EventMap[K]>> } = {
    spl: new Set(),
    rta: new Set(),
    capture: new Set(),
  };
  private statusListeners = new Set<() => void>();
  private rtaUsers = new Map<symbol, BandResolution>();
  private captureUsers = new Set<symbol>();

  status: EngineStatus = {
    mic: 'off',
    error: null,
    sampleRate: null,
    trackSettings: null,
    generatorRunning: false,
    generator: load('generator', DEFAULT_GENERATOR),
  };

  constructor() {
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
      this.generator.connect(ctx.destination);
      this.setStatus({ sampleRate: ctx.sampleRate });
      this.sendGenerator();
    })();
    return this.ready;
  }

  async startMic(): Promise<void> {
    if (this.status.mic === 'on' || this.status.mic === 'starting') return;
    this.setStatus({ mic: 'starting', error: null });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone needs HTTPS. Open the app from its https:// address.');
      }
      const ready = this.ensureContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      await ready;
      const ctx = this.ctx!;
      this.stream = stream;
      this.source = ctx.createMediaStreamSource(stream);
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
      stream.getAudioTracks()[0]?.addEventListener('ended', () => this.stopMic());
      this.setStatus({
        mic: 'on',
        trackSettings: stream.getAudioTracks()[0]?.getSettings() ?? null,
      });
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
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.analyzer?.disconnect();
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
