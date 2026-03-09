/**
 * ConfigValidator tests
 */

import { describe, it, expect } from 'vitest';
import { ConfigValidator, type JSONSchemaDefinition } from './schema.js';

describe('ConfigValidator', () => {
  const validator = new ConfigValidator();

  it('should validate string type', () => {
    const schema: JSONSchemaDefinition = { type: 'string' };
    expect(validator.validate('hello', schema).valid).toBe(true);
    expect(validator.validate(123, schema).valid).toBe(false);
  });

  it('should validate number type', () => {
    const schema: JSONSchemaDefinition = { type: 'number' };
    expect(validator.validate(123, schema).valid).toBe(true);
    expect(validator.validate('123', schema).valid).toBe(false);
  });

  it('should validate boolean type', () => {
    const schema: JSONSchemaDefinition = { type: 'boolean' };
    expect(validator.validate(true, schema).valid).toBe(true);
    expect(validator.validate('true', schema).valid).toBe(false);
  });

  it('should validate object type', () => {
    const schema: JSONSchemaDefinition = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      }
    };

    expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
    expect(validator.validate({ name: 'John' }, schema).valid).toBe(true);
    expect(validator.validate({ name: 123 }, schema).valid).toBe(false);
  });

  it('should validate array type', () => {
    const schema: JSONSchemaDefinition = {
      type: 'array',
      items: { type: 'string' }
    };

    expect(validator.validate(['a', 'b'], schema).valid).toBe(true);
    expect(validator.validate(['a', 123], schema).valid).toBe(false);
  });

  it('should validate required properties', () => {
    const schema: JSONSchemaDefinition = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    };

    expect(validator.validate({ name: 'John' }, schema).valid).toBe(true);
    expect(validator.validate({ age: 30 }, schema).valid).toBe(false);
  });

  it('should validate enum values', () => {
    const schema: JSONSchemaDefinition = {
      type: 'string',
      enum: ['a', 'b', 'c']
    };

    expect(validator.validate('a', schema).valid).toBe(true);
    expect(validator.validate('d', schema).valid).toBe(false);
  });

  it('should validate string constraints', () => {
    const schema: JSONSchemaDefinition = {
      type: 'string',
      minLength: 3,
      maxLength: 10
    };

    expect(validator.validate('abc', schema).valid).toBe(true);
    expect(validator.validate('ab', schema).valid).toBe(false);
    expect(validator.validate('abcdefghijk', schema).valid).toBe(false);
  });

  it('should validate number constraints', () => {
    const schema: JSONSchemaDefinition = {
      type: 'number',
      minimum: 0,
      maximum: 100
    };

    expect(validator.validate(50, schema).valid).toBe(true);
    expect(validator.validate(-1, schema).valid).toBe(false);
    expect(validator.validate(101, schema).valid).toBe(false);
  });

  it('should validate pattern', () => {
    const schema: JSONSchemaDefinition = {
      type: 'string',
      pattern: '^[a-z]+$'
    };

    expect(validator.validate('abc', schema).valid).toBe(true);
    expect(validator.validate('abc123', schema).valid).toBe(false);
  });

  it('should return validation errors', () => {
    const schema: JSONSchemaDefinition = {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    };

    const result = validator.validate({ age: 30 }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should validate nested objects', () => {
    const schema: JSONSchemaDefinition = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            port: { type: 'number' }
          }
        }
      }
    };

    expect(validator.validate({ config: { port: 3000 } }, schema).valid).toBe(true);
    expect(validator.validate({ config: { port: '3000' } }, schema).valid).toBe(false);
  });
});
