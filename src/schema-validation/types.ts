import { create } from './schema';

interface FieldSchema<Type extends keyof FieldSchemas> {
  type: Type;
}

interface ObjectSchema {
  type: 'Object';
  fields: Record<string, Schema>;
}

interface ArraySchema {
  array?: true | false;
}

interface OptionalSchema {
  optional?: true | false;
}

export type Schema = (ObjectSchema | FieldSchema<keyof FieldSchemas>) & ArraySchema & OptionalSchema;

interface FieldSchemas {
  String: string;
  Number: number;
  Bigint: bigint;
  Boolean: boolean;
  U8: Uint8Array;
}

type UnwrapFieldType<Type extends keyof FieldSchemas> = FieldSchemas[Type];

type UnwrapObjectType<T extends Schema> = T extends ObjectSchema
  ? {
      [N in keyof T['fields']]: Unwrap<T['fields'][N]>;
    }
  : T['type'] extends keyof FieldSchemas
  ? UnwrapFieldType<T['type']>
  : never;

type UnwrapArray<T extends Schema> = T['array'] extends true ? Array<UnwrapObjectType<T>> : UnwrapObjectType<T>;

type UnwrapOptional<T extends Schema> = T['optional'] extends true ? UnwrapArray<T> | undefined | null : UnwrapArray<T>;

export type Unwrap<T extends Schema> = UnwrapOptional<T>;

export type EventSchemas = {
  [P in string]: Schema;
};

type EventHandler<T extends Schema, I> = (e: Unwrap<T>, instance: I) => void;

export type EventHandlers<T extends EventSchemas, I> = {
  [Method in keyof T]: EventHandler<T[Method], I>;
};

export type EventSchemaByMethod<Method extends keyof typeof EVENT_SCHEMAS> = Unwrap<typeof EVENT_SCHEMAS[Method]>;
export type RoomUpdatedSchemaType = EventSchemaByMethod<'RoomUpdated'>['updates'][number];
export type PeerUpdatedSchemaType = EventSchemaByMethod<'PeerUpdated'>;
export type MessageReceivedSchemaType = EventSchemaByMethod<'MessageReceived'>;

const MEDIA = create({
  type: 'Object',
  optional: true,
  fields: {
    id: { type: 'Number' },
    properties: {
      type: 'Object',
      fields: {
        fec: {
          type: 'Boolean',
          optional: true,
        },
      },
    },
  },
});

const MEDIAS = create({
  array: true,
  type: 'Object',
  fields: {
    id: { type: 'Number' },
    properties: {
      type: 'Object',
      fields: {
        fec: {
          type: 'Boolean',
          optional: true,
        },
      },
    },
  },
});

const PEER = create({
  type: 'Object',
  fields: {
    id: { type: 'Number' },
    medias: MEDIAS,
    user_data: { type: 'U8' },
    user_id: { type: 'String' },
  },
  optional: true,
});

const PEERS = create({
  array: true,
  type: 'Object',
  fields: {
    id: { type: 'Number' },
    medias: MEDIAS,
    user_data: { type: 'U8' },
    user_id: { type: 'String' },
  },
});

const ROOM = create({
  type: 'Object',
  fields: {
    customer: { type: 'String' },
    id: { type: 'String' },
    peers: PEERS,
    user_data: { type: 'U8' },
  },
  optional: true,
});

export const EVENT_SCHEMAS = {
  RoomUpdated: create({
    type: 'Object',
    fields: {
      updates: {
        type: 'Object',
        array: true,
        fields: {
          kind: { type: 'String' },
          media_ids: { array: true, type: 'Number', optional: true },
          own_peer_id: { type: 'Number', optional: true },
          room: ROOM,
          peer: PEER,
          user_data: { type: 'U8', optional: true },
          peer_id: { type: 'Number', optional: true },
        },
      },
    },
  }),
  PeerUpdated: create({
    type: 'Object',
    fields: {
      kind: { type: 'String' },
      peer_id: { type: 'Number' },
      media: MEDIA,
      properties: {
        type: 'Object',
        fields: {
          fec: { type: 'Boolean', optional: true },
        },
        optional: true,
      },
      media_id: { type: 'Number', optional: true },
      user_data: {
        type: 'U8',
        optional: true,
      },
    },
  }),
  MessageReceived: create({
    type: 'Object',
    fields: {
      sender_peer_id: { type: 'Number' },
      message: { type: 'U8' },
    },
  }),
};
