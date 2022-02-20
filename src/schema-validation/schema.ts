import { Schema, Unwrap } from './types';

export function create<T extends Schema>(schema: T): T {
  return schema;
}

export function validate<T extends Schema>(value: unknown, root: string, schema: T): asserts value is Unwrap<T> {
  innerCheck(value, schema, [root]);
}

function innerCheck<T extends Schema>(value: unknown, schema: T, path: Array<string | number>) {
  if (schema.array === true) {
    assertPath(Array.isArray(value), path, 'is not an array');
    for (let i = 0; i < value.length; ++i) {
      path.push(i);
      innerCheckValue(value[i], schema, path);
      path.pop();
    }
  } else {
    innerCheckValue(value, schema, path);
  }
}

function innerCheckValue<T extends Schema>(value: unknown, schema: T, path: Array<string | number>) {
  if (schema.optional && (value === undefined || value === null)) return;
  if (schema.type === 'Object') {
    assertPath(typeof value === 'object' && Array.isArray(value) === false, path, 'is not an object');
    assertPath(value !== null && value !== undefined, path, 'must not be null');
    for (const field of Object.keys(schema.fields)) {
      const fieldSchema = schema.fields[field];
      path.push(field);
      if (field in value) {
        const fieldValue: unknown = (value as Record<string, unknown>)[field];
        innerCheck(fieldValue, fieldSchema, path);
      } else {
        assertPath(fieldSchema.optional, path, 'is missing');
      }
      path.pop();
    }
  } else {
    switch (schema.type) {
      case 'Number':
        assertPath(typeof value === 'number', path, 'is not a number');
        break;
      case 'Bigint':
        assertPath(typeof value === 'bigint', path, 'is not a bigint');
        break;
      case 'String':
        assertPath(typeof value === 'string', path, 'is not a string');
        break;
      case 'Boolean':
        assertPath(typeof value === 'boolean', path, 'is not a Bool');
        break;
      case 'U8':
        assertPath(checkTypedArrayType(value), path, 'is not a Bool');
        break;
    }
  }
}

function checkTypedArrayType(someTypedArray: any) {
  return (someTypedArray && someTypedArray.constructor && someTypedArray.constructor.name) || null;
}

function assertPath(expr: unknown, path: Array<string | number>, msg: string): asserts expr {
  if (!expr) {
    throw new Error(`Error from field: ${path.join('.')}, reason: ${msg}`);
  }
}
