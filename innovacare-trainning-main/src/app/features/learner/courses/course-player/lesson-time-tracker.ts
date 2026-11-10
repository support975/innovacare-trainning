import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';

export type TimeOnTaskSaver = (lessonId: string, seconds: number) => Promise<void>;

/**
 * Counts active learning time for the lesson on screen.
 *
 * A second counts only while the page is visible AND the learner has interacted
 * in the last two minutes (or a video/audio in the lesson is playing). Time is
 * flushed to the saver every 30 seconds, when the lesson changes and when the
 * player closes, so CE seat-time is not inflated by idle or background tabs.
 *
 * Provided per player instance (not root).
 */
@Injectable()
export class LessonTimeTracker implements OnDestroy {
  private static readonly IDLE_LIMIT_MS = 120_000;
  private static readonly FLUSH_EVERY_S = 30;

  /** Total seconds for the current lesson (stored + this session). */
  readonly seconds = signal(0);

  private readonly zone = inject(NgZone);
  private lessonId: string | null = null;
  private pending = 0;
  private lastActivity = Date.now();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private saver: TimeOnTaskSaver | null = null;
  private mediaPlaying: () => boolean = () => false;
  private listening = false;

  private readonly onActivity = () => {
    this.lastActivity = Date.now();
  };

  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  configure(saver: TimeOnTaskSaver, mediaPlaying: () => boolean): void {
    this.saver = saver;
    this.mediaPlaying = mediaPlaying;
    this.listen();
  }

  /** Switch tracking to a lesson; `storedSeconds` is what was already saved for it. */
  track(lessonId: string | null, storedSeconds = 0): void {
    if (lessonId === this.lessonId) {
      // Same lesson: only adopt a newer stored value (e.g. saved from another tab).
      if (storedSeconds > this.seconds() - this.pending) {
        this.seconds.set(storedSeconds + this.pending);
      }
      return;
    }
    void this.flush();
    this.lessonId = lessonId;
    this.pending = 0;
    this.lastActivity = Date.now();
    this.seconds.set(Math.max(0, Math.floor(storedSeconds)));
    this.ensureTicking();
  }

  async flush(): Promise<void> {
    const lessonId = this.lessonId;
    const amount = this.pending;
    if (!lessonId || amount <= 0 || !this.saver) return;
    this.pending = 0;
    try {
      await this.saver(lessonId, amount);
    } catch {
      // Keep the time so the next flush retries it.
      if (this.lessonId === lessonId) this.pending += amount;
    }
  }

  ngOnDestroy(): void {
    void this.flush();
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
    if (this.listening && typeof window !== 'undefined') {
      for (const evt of ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart']) {
        window.removeEventListener(evt, this.onActivity, true);
      }
      document.removeEventListener('visibilitychange', this.onHide);
      window.removeEventListener('pagehide', this.onHide);
    }
    this.listening = false;
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    for (const evt of ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart']) {
      window.addEventListener(evt, this.onActivity, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onHide);
    this.listening = true;
  }

  private ensureTicking(): void {
    if (this.tickHandle || typeof window === 'undefined') return;
    // Outside the zone so a 1 s timer doesn't run app-wide change detection;
    // the `seconds` signal still schedules a refresh of what displays it.
    this.zone.runOutsideAngular(() => {
      this.tickHandle = setInterval(() => this.tick(), 1000);
    });
  }

  private tick(): void {
    if (!this.lessonId) return;
    if (document.visibilityState !== 'visible') return;
    const active = Date.now() - this.lastActivity < LessonTimeTracker.IDLE_LIMIT_MS;
    if (!active && !this.mediaPlaying()) return;

    this.pending += 1;
    this.seconds.update((s) => s + 1);
    if (this.pending >= LessonTimeTracker.FLUSH_EVERY_S) void this.flush();
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
