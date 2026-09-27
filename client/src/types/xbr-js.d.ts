declare module 'xbr-js' {
  interface XbrOptions { blendColors?: boolean; scaleAlpha?: boolean }
  /** Pixels as little-endian RGBA packed in a Uint32Array (the layout of an ImageData buffer). */
  export function xbr2x(pixels: Uint32Array, width: number, height: number, options?: XbrOptions): Uint32Array;
  export function xbr3x(pixels: Uint32Array, width: number, height: number, options?: XbrOptions): Uint32Array;
  export function xbr4x(pixels: Uint32Array, width: number, height: number, options?: XbrOptions): Uint32Array;
}
