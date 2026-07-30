// src/main/idle-lock.ts
//
// Clinical-safety idle lock: obscures the window after `idleTimeoutSeconds`
// of inactivity (warning at T-60s), and locks immediately on OS
// lock-screen/suspend so a clinician stepping away never leaves patient
// data visible on an unattended workstation.
import { powerMonitor } from 'electron';

const WARNING_LEAD_SECONDS = 60;
const POLL_INTERVAL_MS = 1000;

export interface IdleLockCallbacks {
  onWarning: (secondsRemaining: number) => void;
  onLock: (reason: 'idle-timeout' | 'lock-screen' | 'suspend') => void;
  onUnlockAvailable?: () => void;
}

export class IdleLockManager {
  private readonly idleTimeoutSeconds: number;
  private readonly callbacks: IdleLockCallbacks;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private warningFired = false;
  private locked = false;
  /**
   * Manual extension anchor. `powerMonitor.getSystemIdleTime()` cannot be
   * reset directly (it reflects real OS input events), so "Stay signed in"
   * on the warning overlay instead moves this anchor forward and effective
   * idle time is computed relative to whichever is more recent.
   */
  private lastExtensionAt = Date.now();

  constructor(idleTimeoutSeconds: number, callbacks: IdleLockCallbacks) {
    this.idleTimeoutSeconds = idleTimeoutSeconds;
    this.callbacks = callbacks;
  }

  start(): void {
    this.stop();
    powerMonitor.on('lock-screen', this.handleLockScreen);
    powerMonitor.on('suspend', this.handleSuspend);
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    powerMonitor.removeListener('lock-screen', this.handleLockScreen);
    powerMonitor.removeListener('suspend', this.handleSuspend);
  }

  /** Called from the "Stay signed in" affordance on the warning overlay. */
  extendSession(): void {
    this.lastExtensionAt = Date.now();
    this.warningFired = false;
    if (this.locked) {
      this.locked = false;
      this.callbacks.onUnlockAvailable?.();
    }
  }

  private effectiveIdleSeconds(): number {
    const systemIdleSeconds = powerMonitor.getSystemIdleTime();
    const sinceExtensionSeconds = Math.floor((Date.now() - this.lastExtensionAt) / 1000);
    return Math.min(systemIdleSeconds, sinceExtensionSeconds);
  }

  private tick(): void {
    if (this.locked) {
      return;
    }
    const idleSeconds = this.effectiveIdleSeconds();
    const remaining = this.idleTimeoutSeconds - idleSeconds;

    if (remaining <= 0) {
      this.locked = true;
      this.callbacks.onLock('idle-timeout');
      return;
    }

    if (remaining <= WARNING_LEAD_SECONDS && !this.warningFired) {
      this.warningFired = true;
    }
    if (remaining <= WARNING_LEAD_SECONDS) {
      this.callbacks.onWarning(remaining);
    }
  }

  private handleLockScreen = (): void => {
    this.locked = true;
    this.callbacks.onLock('lock-screen');
  };

  private handleSuspend = (): void => {
    this.locked = true;
    this.callbacks.onLock('suspend');
  };
}
