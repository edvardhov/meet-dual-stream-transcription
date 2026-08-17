export function floatToInt16(sample: number): number {
  const clipped = Math.max(-1, Math.min(1, sample));
  return clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
}

export function encodeInterleavedStereo(left: Float32Array, right: Float32Array): Int16Array {
  const length = Math.min(left.length, right.length);
  const out = new Int16Array(length * 2);
  for (let i = 0; i < length; i += 1) {
    out[i * 2] = floatToInt16(left[i] ?? 0);
    out[i * 2 + 1] = floatToInt16(right[i] ?? 0);
  }
  return out;
}

export class RingBuffer<T> {
  private readonly items: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    while (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  shift(): T | undefined {
    return this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }
}
