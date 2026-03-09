/**
 * ConfigStore tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigStore } from './store.js';

describe('ConfigStore', () => {
  let store: ConfigStore;

  beforeEach(() => {
    store = new ConfigStore({
      defaults: {
        gateway: {
          id: 'test',
          port: 3000
        },
        channels: {}
      }
    });
  });

  it('should get default values', () => {
    expect(store.get('gateway.id')).toBe('test');
    expect(store.get('gateway.port')).toBe(3000);
  });

  it('should get nested values', () => {
    expect(store.get('gateway.id')).toBe('test');
  });

  it('should return undefined for missing keys', () => {
    expect(store.get('missing.key')).toBeUndefined();
  });

  it('should return default value for missing keys', () => {
    expect(store.get('missing.key', 'default')).toBe('default');
  });

  it('should set values', () => {
    store.set('gateway.port', 4000);
    expect(store.get('gateway.port')).toBe(4000);
  });

  it('should set nested values', () => {
    store.set('new.nested.key', 'value');
    expect(store.get('new.nested.key')).toBe('value');
  });

  it('should check if key exists', () => {
    expect(store.has('gateway.id')).toBe(true);
    expect(store.has('missing.key')).toBe(false);
  });

  it('should delete keys', () => {
    store.set('temp.key', 'value');
    expect(store.has('temp.key')).toBe(true);
    store.delete('temp.key');
    expect(store.has('temp.key')).toBe(false);
  });

  it('should get all config', () => {
    const all = store.all();
    expect(all).toHaveProperty('gateway');
    expect(all.gateway).toHaveProperty('id', 'test');
  });

  it('should clear config', () => {
    store.set('temp', 'value');
    store.clear();
    expect(store.get('temp')).toBeUndefined();
    // Defaults should be restored
    expect(store.get('gateway.id')).toBe('test');
  });

  it('should merge config', () => {
    store.merge({ gateway: { port: 5000 } });
    expect(store.get('gateway.id')).toBe('test'); // preserved
    expect(store.get('gateway.port')).toBe(5000); // updated
  });

  it('should watch for changes', () => {
    let called = false;
    const unwatch = store.watch((key, value) => {
      called = true;
      expect(key).toBe('test.key');
      expect(value).toBe('test-value');
    });

    store.set('test.key', 'test-value');
    expect(called).toBe(true);

    unwatch();
  });
});
