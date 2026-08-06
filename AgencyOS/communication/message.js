import { randomUUID } from 'node:crypto';
import { comError, COM_CODES } from './errors.js';

export function newId(prefix = 'msg') {
  return `${prefix}-${randomUUID()}`;
}

export class MessageRegistry {
  constructor({ registry, envelopeSchema, validator }) {
    this.registry = registry;
    this.envelopeSchema = envelopeSchema;
    this.validator = validator;
  }

  typeNames() {
    return Object.keys(this.registry.types).sort();
  }

  def(type) {
    const def = this.registry.types[type];
    if (!def) throw comError(COM_CODES.UNKNOWN_TYPE, `unknown message type "${type}"`, { type });
    return def;
  }

  topicFor(type) {
    return this.def(type).topic;
  }

  validatePayload(type, payload) {
    const def = this.def(type);
    const result = this.validator.validate(payload ?? null, def.payload, { schemaPath: `message:${type}` });
    if (!result.valid) {
      throw comError(COM_CODES.SCHEMA_INVALID, `payload for "${type}" failed message schema validation`, {
        type,
        errors: result.errors.slice(0, 10)
      });
    }
    return true;
  }
}

export function createEnvelope({ type, topic, payload, meta = {}, registry }) {
  const cleanMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) cleanMeta[key] = value;
  }
  const envelope = {
    schema: 'https://agency.os/communication/envelope',
    id: newId(),
    type,
    topic,
    payload,
    meta: {
      ts: new Date().toISOString(),
      origin: cleanMeta.origin ?? 'communication',
      instanceId: cleanMeta.instanceId ?? 'local-1',
      ...cleanMeta,
      ts: new Date().toISOString()
    }
  };
  const result = registry.validator.validate(envelope, registry.envelopeSchema, { schemaPath: 'communication:envelope' });
  if (!result.valid) {
    throw comError(COM_CODES.SCHEMA_INVALID, 'message envelope failed envelope schema validation', {
      type,
      errors: result.errors.slice(0, 10)
    });
  }
  return envelope;
}
