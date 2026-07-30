// test/idle-lock.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { powerMonitor } = vi.hoisted(() => {
  const { EventEmitter: HoistedEventEmitter } = require('node:events') as typeof import('node:events');
  return {
    powerMonitor: Object.assign(new HoistedEventEmitter(), {
      getSystemIdleTime: vi.fn(() => 0)
    })
  };
});

vi.mock('electron', () => ({ powerMonitor }));

import { IdleLockManager } from '../src/main/idle-lock';

// `effectiveIdleSeconds` is bounded by wall-clock time elapsed since the
// manager started/was last extended (see idle-lock.ts), so tests advance
// fake timers by the same amount of elapsed time they mock
// getSystemIdleTime() to report, matching how real elapsed time and real
// OS idle time move together outside of tests.
describe('IdleLockManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    powerMonitor.getSystemIdleTime.mockReturnValue(0);
    powerMonitor.removeAllListeners();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns at the 60s-remaining mark and locks at the deadline', () => {
    const onWarning = vi.fn();
    const onLock = vi.fn();
    const manager = new IdleLockManager(120, { onWarning, onLock });
    manager.start();

    // 50s idle -> 70s remaining -> no warning yet.
    powerMonitor.getSystemIdleTime.mockReturnValue(50);
    vi.advanceTimersByTime(50_000);
    expect(onWarning).not.toHaveBeenCalled();

    // 61s idle -> 59s remaining -> warning should fire.
    powerMonitor.getSystemIdleTime.mockReturnValue(61);
    vi.advanceTimersByTime(11_000);
    expect(onWarning).toHaveBeenCalledWith(59);
    expect(onLock).not.toHaveBeenCalled();

    // 120s idle -> deadline reached -> lock.
    powerMonitor.getSystemIdleTime.mockReturnValue(120);
    vi.advanceTimersByTime(59_000);
    expect(onLock).toHaveBeenCalledWith('idle-timeout');

    manager.stop();
  });

  it('locks immediately on an OS lock-screen event regardless of idle time', () => {
    const onWarning = vi.fn();
    const onLock = vi.fn();
    const manager = new IdleLockManager(900, { onWarning, onLock });
    manager.start();

    powerMonitor.emit('lock-screen');
    expect(onLock).toHaveBeenCalledWith('lock-screen');

    manager.stop();
  });

  it('extendSession resets the warning/lock state', () => {
    const onWarning = vi.fn();
    const onLock = vi.fn();
    const onUnlockAvailable = vi.fn();
    const manager = new IdleLockManager(120, { onWarning, onLock, onUnlockAvailable });
    manager.start();

    powerMonitor.getSystemIdleTime.mockReturnValue(120);
    vi.advanceTimersByTime(120_000);
    expect(onLock).toHaveBeenCalledTimes(1);

    manager.extendSession();
    expect(onUnlockAvailable).toHaveBeenCalledTimes(1);

    powerMonitor.getSystemIdleTime.mockReturnValue(0);
    vi.advanceTimersByTime(1_000);
    expect(onLock).toHaveBeenCalledTimes(1); // still just the one lock from before

    manager.stop();
  });
});
