import { StreamHandler, Stream } from './stream';
import { JsonValue } from './types';

export async function openStream(url: string, handler: StreamHandler) {
  const stream = new Stream(url, handler);
  await new Promise((resolve) => stream.addEventListener('open', resolve, { once: true }));
  return stream;
}

export function toRaw<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
