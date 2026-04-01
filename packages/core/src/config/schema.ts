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
  /** Error message templates */
  private readonly ERRORS = {
    TYPE_MISMATCH: (expected: string, got: string) => `Expected type ${expected}, got ${got}`,
    ENUM_MISMATCH: (values: unknown[]) => `Value must be one of: ${values.join(', ')}`,
    MIN_LENGTH: (min: number) => `Length must be at least ${min}`,
    MAX_LENGTH: (max: number) => `Length must be at most ${max}`,
    ARRAY_MIN_LENGTH: (min: number) => `Array length must be at least ${min}`,
    ARRAY_MAX_LENGTH: (max: number) => `Array length must be at most ${max}`,
    MIN_VALUE: (min: number) => `Must be at least ${min}`,
    MAX_VALUE: (max: number) => `Must be at most ${max}`,
    PATTERN_MISMATCH: (pattern: string) => `Does not match pattern: ${pattern}`,
    REQUIRED_MISSING: 'Required property missing',
    ADDITIONAL_PROPERTY_NOT_ALLOWED: 'Additional property not allowed'
  } as const;

  /** Default path for root level */
  private readonly ROOT_PATH = '.';

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
        path: path || this.ROOT_PATH,
        message: this.ERRORS.TYPE_MISMATCH(schema.type, typeof value),
        value
      });
      return;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.ENUM_MISMATCH(schema.enum),
        value
      });
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
      this.validateString(value, schema, path, errors);
    }

    // Number validation
    if (schema.type === 'number' && typeof value === 'number') {
      this.validateNumber(value, schema, path, errors);
    }

    // Object validation
    if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      this.validateObject(value as Record<string, unknown>, schema, path, errors);
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
      this.validateArray(value, schema, path, errors);
    }
  }

  /**
   * Validate string value
   */
  private validateString(
    value: string,
    schema: JSONSchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.MIN_LENGTH(schema.minLength),
        value
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.MAX_LENGTH(schema.maxLength),
        value
      });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.PATTERN_MISMATCH(schema.pattern),
        value
      });
    }
  }

  /**
   * Validate number value
   */
  private validateNumber(
    value: number,
    schema: JSONSchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.MIN_VALUE(schema.minimum),
        value
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.MAX_VALUE(schema.maximum),
        value
      });
    }
  }

  /**
   * Validate object value
   */
  private validateObject(
    value: Record<string, unknown>,
    schema: JSONSchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    // Required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in value)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            message: this.ERRORS.REQUIRED_MISSING,
            value: undefined
          });
        }
      }
    }

    // Properties validation
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in value) {
          this.validateValue(
            value[prop],
            propSchema,
            path ? `${path}.${prop}` : prop,
            errors
          );
        }
      }
    }

    // Additional properties
    if (schema.additionalProperties === false && schema.properties) {
      for (const prop of Object.keys(value)) {
        if (!(prop in schema.properties)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            message: this.ERRORS.ADDITIONAL_PROPERTY_NOT_ALLOWED,
            value: value[prop]
          });
        }
      }
    }
  }

  /**
   * Validate array value
   */
  private validateArray(
    value: unknown[],
    schema: JSONSchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.ARRAY_MIN_LENGTH(schema.minLength),
        value
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path: path || this.ROOT_PATH,
        message: this.ERRORS.ARRAY_MAX_LENGTH(schema.maxLength),
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
