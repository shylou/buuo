/**
 * Configuration Schema - JSON Schema validation for configuration
 * @module config
 */

export interface JSONSchemaDefinition {
  /** Schema type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

  /** Schema title */
  title?: string;

  /** Schema description */
  description?: string;

  /** Default value */
  default?: unknown;

  /** Required properties */
  required?: string[];

  /** Properties (for object type) */
  properties?: Record<string, JSONSchemaDefinition>;

  /** Items schema (for array type) */
  items?: JSONSchemaDefinition;

  /** Enum values */
  enum?: unknown[];

  /** Minimum value (for number) */
  minimum?: number;

  /** Maximum value (for number) */
  maximum?: number;

  /** Pattern (for string) */
  pattern?: string;

  /** Min length (for string/array) */
  minLength?: number;

  /** Max length (for string/array) */
  maxLength?: number;

  /** Additional properties allowed (for object) */
  additionalProperties?: boolean | JSONSchemaDefinition;
}

export interface ValidationResult {
  /** Is valid */
  valid: boolean;

  /** Validation errors */
  errors?: ValidationError[];
}

export interface ValidationError {
  /** Error path */
  path: string;

  /** Error message */
  message: string;

  /** Invalid value */
  value: unknown;
}

export class ConfigValidator {
  /**
   * Validate data against schema
   */
  validate(data: unknown, schema: JSONSchemaDefinition): ValidationResult {
    const errors: ValidationError[] = [];

    this.validateValue(data, schema, '', errors);

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate a value
   */
  private validateValue(
    value: unknown,
    schema: JSONSchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    // Type validation
    if (!this.validateType(value, schema.type)) {
      errors.push({
        path: path || '.',
        message: `Expected type ${schema.type}, got ${typeof value}`,
        value
      });
      return;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path: path || '.',
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value
      });
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path: path || '.',
          message: `Length must be at least ${schema.minLength}`,
          value
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path: path || '.',
          message: `Length must be at most ${schema.maxLength}`,
          value
        });
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push({
          path: path || '.',
          message: `Does not match pattern: ${schema.pattern}`,
          value
        });
      }
    }

    // Number validation
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path: path || '.',
          message: `Must be at least ${schema.minimum}`,
          value
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path: path || '.',
          message: `Must be at most ${schema.maximum}`,
          value
        });
      }
    }

    // Object validation
    if (schema.type === 'object' && value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      // Required properties
      if (schema.required) {
        for (const prop of schema.required) {
          if (!(prop in obj)) {
            errors.push({
              path: path ? `${path}.${prop}` : prop,
              message: 'Required property missing',
              value: undefined
            });
          }
        }
      }

      // Properties validation
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in obj) {
            this.validateValue(
              obj[prop],
              propSchema,
              path ? `${path}.${prop}` : prop,
              errors
            );
          }
        }
      }

      // Additional properties
      if (schema.additionalProperties === false && schema.properties) {
        for (const prop of Object.keys(obj)) {
          if (!(prop in schema.properties)) {
            errors.push({
              path: path ? `${path}.${prop}` : prop,
              message: 'Additional property not allowed',
              value: obj[prop]
            });
          }
        }
      }
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path: path || '.',
          message: `Array length must be at least ${schema.minLength}`,
          value
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path: path || '.',
          message: `Array length must be at most ${schema.maxLength}`,
          value
        });
      }
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          this.validateValue(
            value[i],
            schema.items,
            `${path}[${i}]`,
            errors
          );
        }
      }
    }
  }

  /**
   * Validate type
   */
  private validateType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }
}
