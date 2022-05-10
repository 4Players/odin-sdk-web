import { StreamHandler, Stream } from './stream';
import { JsonValue } from './types';

export async function openStream(url: string, handler: StreamHandler): Promise<Stream> {
  const stream = new Stream(url, handler);
  try {
    await new Promise((resolve) => stream.addEventListener('open', resolve, { once: true }));
  } catch (e) {
    throw new Error('Could not open the main stream\n' + e);
  }
  return stream;
}

export function toRaw<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function parseJwt(token: string) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const payload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
  return JSON.parse(payload);
}

/**
 * Encodes a value or an object with the help of JSON.stringify to an Uint8Array.
 *
 * @param value Value or object to encode
 * @returns The Uint8Array encoded value
 */
export function valueToUint8Array(value: any): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/**
 * Decodes a Uint8Array.
 *
 * @param bytes Byte array to decode
 * @returns The decoded value or undefined on error
 */
export function uint8ArrayToValue(bytes: Uint8Array): unknown {
  if (bytes.length === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return undefined;
  }
}
