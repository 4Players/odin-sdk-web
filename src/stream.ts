import { pack, unpack } from 'msgpackr';
import { OdinEventMethods } from './types';
import { EventHandlers, EventSchemas } from './schema-validation/types';
import { validate } from './schema-validation/schema';

export type StreamHandler = (method: OdinEventMethods, params: unknown) => void;

export interface RequestResolve {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout | null;
  handler?: (method: string, params: unknown) => Promise<unknown>;
}

export class Stream {
  private _websocket: WebSocket | null;
  private _requests: Map<number, RequestResolve> = new Map();
  private nextId = 0;

  constructor(private _url: string, private _handler: StreamHandler, private _timeout = 5000) {
    this._websocket = new WebSocket(_url);
    this._websocket.binaryType = 'arraybuffer';
    this._websocket.addEventListener('close', () => {
      this._websocket = null;
      this._requests.forEach(({ reject }) => reject(new Error('closed')));
      this._requests.clear();
    });
    this._websocket.addEventListener('message', async (e) => {
      await receive(this, e.data);
    });
  }

  get url(): string {
    return this._url;
  }

  get websocket(): WebSocket | null {
    return this._websocket ?? null;
  }

  get timeout(): number {
    return this._timeout;
  }

  get requests(): Map<number, RequestResolve> {
    return this._requests;
  }

  get handler(): StreamHandler {
    return this._handler;
  }

  get onopen(): ((this: WebSocket, ev: Event) => any) | null {
    if (this.websocket) {
      return this.websocket.onopen;
    } else {
      return null;
    }
  }

  set onopen(value) {
    if (this.websocket) {
      this.websocket.onopen = value;
    }
  }

  get onclose(): ((this: WebSocket, ev: CloseEvent) => any) | null {
    if (this.websocket) {
      return this.websocket.onclose;
    } else {
      return null;
    }
  }

  set onclose(value) {
    if (this.websocket) {
      this.websocket.onclose = value;
    }
  }

  set onerror(value: ((this: WebSocket, ev: Event) => any) | null) {
    if (this.websocket) {
      this.websocket.onerror = value;
    }
  }

  get onerror(): ((this: WebSocket, ev: Event) => any) | null {
    if (this.websocket) {
      return this.websocket.onerror;
    }
    return null;
  }

  async addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): Promise<void> {
    if (this.websocket) {
      return this.websocket.addEventListener(type, listener, options);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (this.websocket) {
      return this.websocket.removeEventListener(type, listener, options);
    }
  }

  request(method: string, params: any): Promise<unknown> {
    const id = this.nextId++;
    return send(this, id, method, params);
  }

  close() {
    if (this.websocket) {
      this.websocket.close();
    }
  }
}

/**
 * Packs and sends the request via the websocket. Requests getting cached until they are resolved.
 */
async function send(stream: Stream, id: number | null, method: string, params: any): Promise<void | unknown> {
  if (stream.websocket === null) {
    throw new Error('stream closed');
  }
  const request = id !== null ? [0, id, method, params] : [2, method, params];
  const packedRequest = pack(request);

  stream.websocket.send(packedRequest);

  if (id === null) {
    return Promise.resolve();
  } else {
    // If a timeout was set, define a new timeout handle which deletes the request and closes the stream
    return new Promise((resolve, reject) => {
      let timeoutHandle = null;
      if (stream.timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (stream.requests.delete(id)) {
            reject(new Error('timeout at method: ' + method));
            stream.close();
          }
        }, stream.timeout);
      }
      stream.requests.set(id, { method, resolve, reject, timeoutHandle });
    });
  }
}

/**
 * Event listener to process the event.data from the given stream.
 *
 * Implementation of the MessagePack-RPC Specification:
 * @see https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md
 *
 * @param {Stream} stream
 * @param {ArrayBuffer} bytes (event.data)
 **/
async function receive(stream: Stream, bytes: any) {
  const message = unpack(new Uint8Array(bytes));
  const valid = Array.isArray(message) && message.length > 0 && typeof message[0] === 'number';
  if (!valid) {
    console.error('received invalid formatted message', message);
    return;
  }
  /**
   * Request Message
   * [type, msgid, method, params]
   */
  switch (message[0]) {
    case 0: {
      const valid =
        message.length === 4 &&
        typeof message[1] === 'number' &&
        typeof message[2] === 'string' &&
        typeof message[3] === 'object';
      if (valid) {
        await receiveRequest(stream, message[1], message[2], message[3]);
      } else {
        console.error('received invalid formatted request', message);
      }
      break;
    }
    /**
     * Response Message
     * [type, msgid, error, result]
     */
    case 1: {
      const valid =
        message.length === 4 &&
        typeof message[1] === 'number' &&
        (message[2] === null || typeof message[2] === 'string') &&
        (message[3] === null || typeof message[3] === 'object') &&
        (message[2] === null || message[3] === null);

      const result = message[3];
      if (valid) {
        receiveResponse(stream, message[1], message[2], result);
        // handler(message[1], message[3]);
      } else {
        console.error('received invalid formatted response', message);
      }
      break;
    }
    /**
     * Notification Message
     * [type, method, params]
     */
    case 2: {
      const valid = message.length === 3 && typeof message[1] === 'string' && typeof message[2] === 'object';
      if (valid) {
        await receiveRequest(stream, null, message[1], message[2]);
      } else {
        console.error('received invalid formatted request', message);
      }
      break;
    }
  }
}

/**
 * MessagePack RPC request handling.
 * Calls the given handler method.
 */
async function receiveRequest(stream: Stream, id: number | null, method: OdinEventMethods, params: unknown) {
  try {
    const response = stream.handler(method, params);
    if (id !== null && stream.websocket !== null) {
      stream.websocket.send(pack([1, id, null, response]));
    }
  } catch (error) {
    if (id !== null && stream.websocket !== null) {
      const message = error instanceof Error ? error.message : 'internal error';
      stream.websocket.send(pack([1, id, message, null]));
    }
  }
}

/**
 * MessagePack response handling.
 */
function receiveResponse<T extends EventSchemas>(
  stream: Stream,
  id: number,
  error: string | undefined,
  result: unknown
) {
  const request = stream.requests.get(id);
  if (request === undefined) {
    return;
  }
  stream.requests.delete(id);
  if (request.timeoutHandle !== null) {
    clearTimeout(request.timeoutHandle);
  }
  if (error === null) {
    request.resolve(result);
  } else {
    request.reject(new Error(error));
  }
}

/**
 * Creates a handler which correctly handles the event depending on the method and validates its params.
 *
 * @param schemas The object which provides the schemas that are used to check recursively the type of the value at runtime
 * @param handlers All event handler for the given schema<T>
 *
 * @returns Returns a handler function that takes the method (type) and the params as argument (The msgpack params).
 * Internally, this function checks, if the method is known in the schemas, and if this is the case, handle the event.
 */
export const makeHandler = <T extends EventSchemas, I>(schemas: T, handlers: EventHandlers<T, I>, instance: I) => {
  return (method: string, params: unknown) => {
    if (isKnownMethod(schemas, method)) {
      handleEvent(schemas, handlers, method, params, instance);
    } else {
      throw Error('Unknown method!');
    }
  };
};

/**
 * Check if the method (from msgpack) is a property of the schema. If not, the event can not be handled.
 * @param schemas Schema object
 * @param method Name of the method
 * @returns true if the property is a keyof EventSchemas (boolean)
 */
const isKnownMethod = <T extends EventSchemas>(schemas: T, method: PropertyKey): method is keyof EventSchemas => {
  return Object.getOwnPropertyDescriptor(schemas, method) != null;
};

/**
 * Validates the params and calls the given eventHandler, determined by the given method.
 *
 * @param schemas Schema object
 * @param handlers All provided EventHandlers<T> while T is a EventSchema
 * @param method A string which is one of the EventHandler names
 * @param params The params that getting passes through and getting called
 */
const handleEvent = <T extends EventSchemas, U extends keyof T, I>(
  schemas: T,
  handlers: EventHandlers<T, I>,
  method: U,
  params: unknown,
  instance: I
) => {
  const schema = schemas[method];
  validate(params, 'parameters', schema);
  handlers[method](params, instance);
};
