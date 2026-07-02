/**
 * Minimal type shim for the "gifenc" package, which ships no type declarations
 * of its own. Only covers the API surface actually used in this project
 * (src/components/dualMapExport.ts).
 */
declare module 'gifenc' {
  export type GifFormat = 'rgb565' | 'rgba4444' | 'rgb444';

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: GifFormat },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: GifFormat,
  ): Uint8Array;

  export function nearestColorIndex(palette: number[][], color: number[]): number;

  export type GifWriteFrameOptions = {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
  };

  export type GifEncoderInstance = {
    writeFrame(
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options?: GifWriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): number[];
    bytesView(): Uint8Array;
    reset(): void;
  };

  export function GIFEncoder(options?: { auto?: boolean }): GifEncoderInstance;
}
