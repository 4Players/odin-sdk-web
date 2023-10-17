import { OdinStreamHandler, OdinStream } from './stream';
import { OdinAudioContextConfig } from './types';

/**
 * Opens a new ODIN main/room stream and registers events handlers.
 *
 * @param url     The URL to the main/room stream server
 * @param handler The handler for ODIN events
 * @returns       The new steam
 */
export async function openStream(url: string, handler: OdinStreamHandler): Promise<OdinStream> {
  const stream = new OdinStream(url, handler);
  try {
    await new Promise((resolve, reject) => {
      stream.addEventListener('open', resolve, { once: true });
      stream.addEventListener('error', reject, { once: true });
    });
  } catch (e) {
    throw new Error(`Failed to connect to '${url}'`);
  }
  return stream;
}

/**
 * Validates and parses a given JWT and returns its claims.
 *
 * @param token The JWT to parse
 * @returns     The payload
 */
export function parseJwt(token: string) {
  if (!/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+(\.[A-Za-z0-9-_=]+)?$/.test(token)) {
    return {};
  }
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
 * @returns     The Uint8Array encoded value
 */
export function valueToUint8Array(value: any): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/**
 * Decodes a Uint8Array.
 *
 * @param bytes Byte array to decode
 * @returns     The decoded value or undefined on error
 */
export function uint8ArrayToValue(bytes: Uint8Array): unknown {
  if (bytes.length === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return undefined;
  }
}

/**
 * Creates new audio contexts for both audio input and output.
 * If the sample rate of the input device is 48 kHz, we can use the same audio context for both.
 *
 * @param input Current input audio context
 * @returns     The new set of audio contexts
 */
export function setupDefaultAudioContext(input: AudioContext): OdinAudioContextConfig {
  const output = input.sampleRate === 48000 ? input : new AudioContext({ sampleRate: 48000 });

  return { input, output };
}

/**
 * Tests the user agent against a valid pattern for Blink-based browsers.
 *
 * @returns True if we're using a Blink browser
 */
export function isBlinkBrowser(): boolean {
  const pattern = /(apple)?webkit\/537\.36/i;
  return pattern.test(window.navigator.userAgent);
}

/**
 * Generate a random point inside a unit sphere.
 *
 * @return The new position
 */
export function randomPointInUnitSphere(): [number, number, number] {
  const theta = Math.random() * 2.0 * Math.PI;
  const phi = Math.random() * Math.PI;
  const r = Math.cbrt(Math.random());

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  return [x, y, z];
}
