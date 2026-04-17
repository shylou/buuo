import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from '@buuo/core';
import {
  claimPidFile,
  cleanupPidFile,
  getGatewayRuntimeStatus,
  readPidFile,
} from './gateway.js';

function createFsMock(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));

  return {
    existsSync: vi.fn((path: string) => files.has(path)),
    readFileSync: vi.fn((path: string) => {
      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return value;
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      files.set(path, content);
    }),
    unlinkSync: vi.fn((path: string) => {
      files.delete(path);
    }),
    files,
  };
}

function createLoggerMock(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe('gateway PID file guards', () => {
  const pidFile = '/tmp/test-gateway.pid';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should read an existing pid file', () => {
    const fsMock = createFsMock({ [pidFile]: '123\n' });

    expect(readPidFile(fsMock as any, pidFile)).toBe(123);
  });

  it('should reject claiming a pid file owned by a running process', () => {
    const fsMock = createFsMock({ [pidFile]: '321' });
    const logger = createLoggerMock();
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    expect(() => claimPidFile(fsMock as any, pidFile, logger)).toThrow(
      'Gateway is already running with PID 321'
    );
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('should replace a stale pid file when the recorded process is gone', () => {
    const fsMock = createFsMock({ [pidFile]: '654' });
    const logger = createLoggerMock();
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('ESRCH') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    });
    vi.spyOn(process, 'pid', 'get').mockReturnValue(999);

    claimPidFile(fsMock as any, pidFile, logger);

    expect(fsMock.unlinkSync).toHaveBeenCalledWith(pidFile);
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(pidFile, '999');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should only clean up the pid file when it belongs to the current process', () => {
    const fsMock = createFsMock({ [pidFile]: '777' });

    cleanupPidFile(fsMock as any, pidFile, 888);
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();

    cleanupPidFile(fsMock as any, pidFile, 777);
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(pidFile);
  });

  it('should report a running gateway when the pid is alive', () => {
    const fsMock = createFsMock({ [pidFile]: '4321' });
    vi.spyOn(process, 'kill').mockImplementation(() => true as never);

    expect(getGatewayRuntimeStatus(fsMock as any, pidFile)).toEqual({
      running: true,
      pid: 4321,
      stalePid: false,
    });
    expect(fsMock.unlinkSync).not.toHaveBeenCalled();
  });

  it('should remove a stale pid file when reporting stopped status', () => {
    const fsMock = createFsMock({ [pidFile]: '6543' });
    vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('ESRCH') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    });

    expect(getGatewayRuntimeStatus(fsMock as any, pidFile)).toEqual({
      running: false,
      pid: 6543,
      stalePid: true,
    });
    expect(fsMock.unlinkSync).toHaveBeenCalledWith(pidFile);
  });
});
