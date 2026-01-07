/// <reference types="vite/client" />

declare module '*.worker.ts' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

declare module 'essentia.js' {
  export interface Essentia {
    arrayToVector(array: Float32Array): unknown;
    vectorToArray(vector: unknown): Float32Array;
    MelBands(
      spectrum: unknown,
      inputSize: number,
      highFrequencyBound: number,
      lowFrequencyBound: number,
      numberBands: number,
      sampleRate: number,
      type: string,
      weighting: string
    ): { bands: unknown };
    Spectrum(
      frame: unknown,
      size: number
    ): { spectrum: unknown };
    Windowing(
      frame: unknown,
      normalized: boolean,
      size: number,
      type: string,
      zeroPadding: number,
      zeroPhase: boolean
    ): { frame: unknown };
  }
  
  export function EssentiaWASM(): Promise<{ EssentiaJS: new () => Essentia }>;
}

// WebGPU types (not yet in standard lib)
interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
  // ...
}

interface Navigator {
  gpu?: GPU;
}
