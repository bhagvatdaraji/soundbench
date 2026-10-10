// Minimal AudioWorkletGlobalScope typings (not in lib.dom).
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(
  name: string,
  ctor: new (options?: any) => AudioWorkletProcessor & {
    process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean;
  },
): void;
