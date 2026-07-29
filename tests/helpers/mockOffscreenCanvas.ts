// tests/helpers/mockOffscreenCanvas.ts
// Polyfill OffscreenCanvas + HTMLCanvasElement.getContext for jsdom.

import { vi } from 'vitest';

function make2DContext() {
  return {
    fillStyle:   '',
    strokeStyle: '',
    lineWidth:   1,
    font:        '',
    textAlign:   'left' as CanvasTextAlign,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur:  0,
    fillRect:      vi.fn(),
    strokeRect:    vi.fn(),
    clearRect:     vi.fn(),
    beginPath:     vi.fn(),
    moveTo:        vi.fn(),
    lineTo:        vi.fn(),
    stroke:        vi.fn(),
    fill:          vi.fn(),
    drawImage:     vi.fn(),
    fillText:      vi.fn(),
    strokeText:    vi.fn(),
    setLineDash:   vi.fn(),
    save:          vi.fn(),
    restore:       vi.fn(),
    measureText:   vi.fn(() => ({ width: 0 })),
    getImageData:  vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
    putImageData:  vi.fn(),
    arc:           vi.fn(),
    rect:          vi.fn(),
    closePath:     vi.fn(),
    scale:         vi.fn(),
    translate:     vi.fn(),
    rotate:        vi.fn(),
    clip:          vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

export function mockOffscreenCanvas(): void {
  // OffscreenCanvas polyfill
  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    class OffscreenCanvasMock {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width  = w;
        this.height = h;
      }
      getContext(_type: string) {
        return make2DContext();
      }
      transferToImageBitmap() { return {} as ImageBitmap; }
    }
    (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = OffscreenCanvasMock;
  }

  // HTMLCanvasElement.getContext stub
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function (type: string) {
      if (type === '2d') return make2DContext() as unknown as CanvasRenderingContext2D;
      return null;
    };
    (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).transferControlToOffscreen = function () {
      return new (globalThis as unknown as { OffscreenCanvas: new (w: number, h: number) => unknown }).OffscreenCanvas(
        (this as HTMLCanvasElement).width,
        (this as HTMLCanvasElement).height,
      );
    };
  }
}
