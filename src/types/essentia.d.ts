declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export default class Essentia {
    constructor(wasmModule: any);
    algorithm(name: string, options?: any): any;
    arrayToVector(array: Float32Array | number[]): any;
  }
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: any;
}
