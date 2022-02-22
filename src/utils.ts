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
