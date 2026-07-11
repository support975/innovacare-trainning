import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { ExamBlueprint, ExamBlueprintQuestion } from '../../../data/exam-blueprint.model';
import { Firestore, collection, addDoc, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth, signOut } from '@angular/fire/auth';

type QuestionResultDetail = {
  id: string;
  order: number;
  prompt: string;
  your: string[];
  correct: string[];
  isCorrect: boolean;
  explanation?: string;
};

@Component({
  selector: 'app-blueprint-exam-runner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './blueprint-exam-runner.html',
  styleUrls: ['./blueprint-exam-runner.css'],
})
export class BlueprintExamRunnerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private blueprintSvc = inject(ExamBlueprintService);
  private applicationsSvc = inject(CandidateApplicationService);
  private afs = inject(Firestore);
  private fbAuth = inject(Auth);

  applicationId = '';
  blueprintId = '';
  private storageKey = '';
  private uid = '';

  // Kiosk mode: launched from the kiosk exam login with query params instead of route params
  kioskMode = false;
  private kioskSessionId = '';
  private kioskStationId = '';
  private kioskCandidateEmail = '';
  private kioskCandidateName = '';

  // Kiosk lockdown: re-arm the history trap whenever the learner presses back/forward
  private blockHistoryNav = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.href);
    }
  };
  // Warn on refresh/close attempts while an exam is in progress
  private blockUnload = (e: BeforeUnloadEvent) => {
    if (this.phase() === 'questions' || this.phase() === 'review') {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  // ── Online proctoring (remote/diaspora candidates, non-kiosk) ──────────
  // Leaving the exam tab is recorded as a violation; 3 violations auto-submit.
  private readonly MAX_PROCTOR_VIOLATIONS = 3;
  proctorViolations = signal(0);
  proctorWarning = signal('');
  private onlineProctored = false;

  private onVisibilityViolation = () => {
    if (typeof document === 'undefined' || !document.hidden) return;
    if (this.phase() !== 'questions' && this.phase() !== 'review') return;
    const count = this.proctorViolations() + 1;
    this.proctorViolations.set(count);
    if (count >= this.MAX_PROCTOR_VIOLATIONS) {
      this.proctorWarning.set('Too many exam-window exits — your exam is being submitted automatically.');
      void this.submit();
    } else {
      this.proctorWarning.set(
        `⚠️ Proctoring alert ${count}/${this.MAX_PROCTOR_VIOLATIONS}: you left the exam window. ` +
        'This is recorded. Leaving again may end your exam.'
      );
    }
  };

  notice = signal('');
  busy = signal(false);
  phase = signal<'questions' | 'review' | 'scoring' | 'results'>('questions');
  currentQuestionIndex = signal(0);
  displayPercent = signal(0);

  blueprint = signal<ExamBlueprint | null>(null);
  answerRevision = signal(0);
  answers = new Map<string, Set<string>>();

  flagRevision = signal(0);
  flagged = new Set<string>();

  private examStartedAt: number | null = null;
  private timerHandle?: ReturnType<typeof setInterval>;
  remainingSeconds = signal<number | null>(null);

  percent = signal<number>(0);
  result = signal<{
    total: number;
    correct: number;
    percent: number;
    passed: boolean;
    details: QuestionResultDetail[];
  } | null>(null);

  readonly questions = computed<ExamBlueprintQuestion[]>(() =>
    [...(this.blueprint()?.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentQuestionIndex()] ?? null);
  readonly passThreshold = computed(() => Number(this.blueprint()?.passingScore ?? 80));
  readonly durationMinutes = computed(() => {
    const explicit = Number(this.blueprint()?.durationMinutes);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const total = this.totalQuestions();
    return total > 0 ? Math.max(30, Math.round(total * 1.5)) : 60;
  });

  readonly progressPercent = computed(() => {
    const total = this.totalQuestions();
    if (!total) return 0;
    return Math.round(((this.currentQuestionIndex() + 1) / total) * 100);
  });
  readonly answeredCount = computed(() => {
    this.answerRevision();
    return this.questions().filter((q) => (this.answers.get(q.id!)?.size ?? 0) > 0).length;
  });
  readonly unansweredCount = computed(() => this.totalQuestions() - this.answeredCount());
  readonly flaggedCount = computed(() => {
    this.flagRevision();
    return this.flagged.size;
  });
  readonly isLastQuestion = computed(() => this.currentQuestionIndex() >= this.totalQuestions() - 1);

  readonly formattedTime = computed(() => {
    const secs = this.remainingSeconds();
    if (secs === null) return '--:--:--';
    const clamped = Math.max(0, secs);
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
  readonly timeLow = computed(() => (this.remainingSeconds() ?? Infinity) <= 300);
  readonly timeCritical = computed(() => (this.remainingSeconds() ?? Infinity) <= 60);

  async ngOnInit(): Promise<void> {
    this.applicationId = this.route.snapshot.paramMap.get('applicationId') || '';
    this.blueprintId = this.route.snapshot.paramMap.get('blueprintId') || '';

    // Kiosk mode: session-based exam launched from the kiosk login page
    const qp = this.route.snapshot.queryParamMap;
    if (!this.blueprintId && qp.get('examId')) {
      this.kioskMode = true;
      this.blueprintId = qp.get('examId') || '';
      this.kioskSessionId = qp.get('sessionId') || '';
      this.kioskStationId = qp.get('stationId') || '';
      this.uid = qp.get('candidateUid') || '';
      this.kioskCandidateEmail = qp.get('email') || '';
      this.kioskCandidateName = qp.get('name') || '';

      // Lock the browser down for the duration of the exam:
      // trap back/forward navigation and warn on refresh/close.
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', window.location.href);
        window.addEventListener('popstate', this.blockHistoryNav);
        window.addEventListener('beforeunload', this.blockUnload);
      }
    }

    if (!this.blueprintId || (!this.applicationId && !this.kioskMode)) {
      this.notice.set('Invalid exam link.');
      return;
    }

    if (!this.kioskMode) {
      this.uid = this.auth.currentUid || '';
      // Remote candidates (diaspora) take this exam online: enable the
      // lightweight proctoring guard — tab-switch detection + unload warning.
      this.onlineProctored = true;
      if (typeof window !== 'undefined') {
        document.addEventListener('visibilitychange', this.onVisibilityViolation);
        window.addEventListener('beforeunload', this.blockUnload);
      }
    }
    this.storageKey = `blueprintExam:${this.blueprintId}:${this.uid}`;

    try {
      if (!this.kioskMode) {
        const application = await this.applicationsSvc.getApplication(this.applicationId);
        if (!application || !['eligible', 'approved_for_exam'].includes(application.status)) {
          this.notice.set('This exam is not available for your application.');
          return;
        }
      }

      const blueprint = await this.blueprintSvc.getBlueprint(this.blueprintId);
      if (!blueprint || blueprint.status !== 'published') {
        this.notice.set('This exam is not available yet.');
        return;
      }

      this.blueprint.set(blueprint);
      this.restoreLocalState();
      this.startTimer();
    } catch (err: any) {
      this.notice.set(err?.message || 'Unable to load the exam.');
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.blockHistoryNav);
      window.removeEventListener('beforeunload', this.blockUnload);
      document.removeEventListener('visibilitychange', this.onVisibilityViolation);
    }
  }

  private restoreLocalState(): void {
    if (typeof window === 'undefined' || !this.storageKey) return;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.answers) {
        for (const [qid, values] of Object.entries(saved.answers as Record<string, string[]>)) {
          this.answers.set(qid, new Set(values));
        }
      }
      if (Array.isArray(saved.flagged)) {
        this.flagged = new Set(saved.flagged);
      }
      if (Number.isFinite(saved.startedAt)) {
        this.examStartedAt = saved.startedAt;
      }
      if (Number.isFinite(saved.currentQuestionIndex)) {
        this.currentQuestionIndex.set(Math.max(0, saved.currentQuestionIndex));
      }
      this.answerRevision.update((v) => v + 1);
      this.flagRevision.update((v) => v + 1);
    } catch {
      // ignore malformed local state
    }
  }

  private persistLocalState(): void {
    if (typeof window === 'undefined' || !this.storageKey) return;
    const answersObj: Record<string, string[]> = {};
    for (const [qid, set] of this.answers.entries()) {
      answersObj[qid] = Array.from(set);
    }
    window.localStorage.setItem(
      this.storageKey,
      JSON.stringify({
        answers: answersObj,
        flagged: Array.from(this.flagged),
        startedAt: this.examStartedAt,
        currentQuestionIndex: this.currentQuestionIndex(),
      })
    );
  }

  private clearLocalState(): void {
    if (typeof window === 'undefined' || !this.storageKey) return;
    window.localStorage.removeItem(this.storageKey);
  }

  private startTimer(): void {
    if (this.timerHandle) return;
    if (!this.examStartedAt) {
      this.examStartedAt = Date.now();
    }
    const tick = () => {
      const elapsedSec = Math.floor((Date.now() - (this.examStartedAt as number)) / 1000);
      const totalSec = this.durationMinutes() * 60;
      const remaining = totalSec - elapsedSec;
      this.remainingSeconds.set(Math.max(0, remaining));
      if (remaining <= 0) {
        this.stopTimer();
        if (this.phase() === 'questions' || this.phase() === 'review') {
          this.notice.set("Le temps imparti est écoulé. Soumission automatique de l'examen.");
          void this.submit();
        }
      }
    };
    tick();
    this.timerHandle = setInterval(tick, 1000);
  }

  private stopTimer(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = undefined;
    }
  }

  letterFor(index: number): string {
    return String.fromCharCode(65 + index);
  }

  toggleOption(qid: string, optId: string, mode: 'single' | 'multi'): void {
    if (mode === 'single') {
      this.answers.set(qid, new Set([optId]));
    } else {
      const set = this.answers.get(qid) ?? new Set<string>();
      if (set.has(optId)) set.delete(optId);
      else set.add(optId);
      this.answers.set(qid, set);
    }
    this.answerRevision.update((v) => v + 1);
    this.persistLocalState();
  }

  isSelected(qid: string, optId: string): boolean {
    this.answerRevision();
    return this.answers.get(qid)?.has(optId) || false;
  }

  toggleFlag(qid: string): void {
    if (this.flagged.has(qid)) this.flagged.delete(qid);
    else this.flagged.add(qid);
    this.flagRevision.update((v) => v + 1);
    this.persistLocalState();
  }

  isFlagged(qid: string): boolean {
    this.flagRevision();
    return this.flagged.has(qid);
  }

  questionStatus(q: ExamBlueprintQuestion): 'answered' | 'flagged' | 'answered-flagged' | 'unanswered' {
    this.answerRevision();
    this.flagRevision();
    const answered = (this.answers.get(q.id!)?.size ?? 0) > 0;
    const flag = this.flagged.has(q.id!);
    if (answered && flag) return 'answered-flagged';
    if (flag) return 'flagged';
    if (answered) return 'answered';
    return 'unanswered';
  }

  goToPreviousQuestion(): void {
    this.notice.set('');
    this.currentQuestionIndex.update((i) => Math.max(0, i - 1));
    this.persistLocalState();
  }

  goToNextQuestion(): void {
    this.notice.set('');
    this.currentQuestionIndex.update((i) => Math.min(this.totalQuestions() - 1, i + 1));
    this.persistLocalState();
  }

  goToReview(): void {
    this.notice.set('');
    this.phase.set('review');
  }

  backToQuestions(index?: number): void {
    this.notice.set('');
    if (typeof index === 'number') {
      this.currentQuestionIndex.set(Math.max(0, Math.min(this.totalQuestions() - 1, index)));
    }
    this.phase.set('questions');
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.notice.set('');
    this.phase.set('scoring');
    this.displayPercent.set(0);
    this.stopTimer();
    this.busy.set(true);

    try {
      const blueprint = this.blueprint();
      if (!blueprint) throw new Error('Exam data missing.');

      const details: QuestionResultDetail[] = [];
      let earnedPoints = 0;
      let totalPoints = 0;

      for (const q of this.questions()) {
        const yourSet = this.answers.get(q.id!) || new Set<string>();
        const correctSet = new Set(q.correctAnswers || []);
        const isCorrect =
          yourSet.size === correctSet.size &&
          [...yourSet].every((v) => correctSet.has(v));
        const points = q.points || blueprint.pointsPerQuestion || 10;
        totalPoints += points;
        if (isCorrect) earnedPoints += points;

        details.push({
          id: q.id!,
          order: q.order,
          prompt: q.prompt,
          your: Array.from(yourSet),
          correct: Array.from(correctSet),
          isCorrect,
          explanation: q.explanation,
        });
      }

      const percent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      const passed = percent >= this.passThreshold();

      this.percent.set(percent);
      this.result.set({
        total: this.questions().length,
        correct: details.filter((d) => d.isCorrect).length,
        percent,
        passed,
        details,
      });

      if (!this.kioskMode) {
        await this.applicationsSvc.markExamCompleted(this.applicationId, {
          blueprintId: this.blueprintId,
          percent,
          passed,
          correct: details.filter((d) => d.isCorrect).length,
          total: details.length,
          completedAt: Date.now(),
        });
      }

      // Save exam attempt for kiosk/email notifications
      try {
        const attemptRef = await addDoc(collection(this.afs, 'examAttempts'), {
          candidateUid: this.uid,
          blueprintId: this.blueprintId,
          applicationId: this.applicationId || null,
          sessionId: this.kioskSessionId || null,
          candidateEmail: this.kioskCandidateEmail || null,
          candidateName: this.kioskCandidateName || null,
          score: percent,
          passed,
          correctCount: details.filter((d) => d.isCorrect).length,
          totalQuestions: details.length,
          details,
          proctoringViolations: this.onlineProctored ? this.proctorViolations() : 0,
          proctoringMode: this.kioskMode ? 'onsite_kiosk' : 'online_remote',
          completedAt: serverTimestamp(),
        });

        // Redirect to results page (learner flow only)
        if (!this.kioskMode) {
          await this.router.navigate(['/exam-results'], {
            queryParams: { attemptId: attemptRef.id },
          });
        }
      } catch (e) {
        console.error('Failed to save exam attempt:', e);
      }

      this.clearLocalState();

      if (this.kioskMode) {
        // Consume the verification: one verification = one attempt. The
        // candidate can no longer log in at the kiosk unless the proctor
        // verifies them again.
        try {
          await setDoc(
            doc(this.afs, `examSessions/${this.kioskSessionId}/candidateVerifications/${this.uid}`),
            {
              verified: false,
              examCompleted: true,
              examCompletedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {
          console.error('Failed to consume verification:', e);
        }

        // Kiosk stations return straight to the session login page for the
        // next candidate — no results screen, no navigable history.
        await this.exitKioskToLogin();
        return;
      }

      await this.animateScore(percent);
      this.phase.set('results');
    } catch (err: any) {
      this.notice.set(err?.message || 'Failed to submit exam.');
      this.phase.set('questions');
      this.startTimer();
    } finally {
      this.busy.set(false);
    }
  }

  goToApplications(): void {
    this.router.navigate(['/learner/official-certifications']);
  }

  private async exitKioskToLogin(): Promise<void> {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.blockHistoryNav);
      window.removeEventListener('beforeunload', this.blockUnload);
    }
    // Sign the candidate out — the kiosk login page re-establishes its own
    // anonymous session for the next candidate.
    try {
      await signOut(this.fbAuth);
    } catch (e) {
      console.error('Kiosk sign-out failed:', e);
    }
    await this.router.navigate(
      ['/kiosk-exam', this.kioskSessionId, this.kioskStationId || '1'],
      { replaceUrl: true }
    );
  }

  private animateScore(target: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        this.displayPercent.set(target);
        resolve();
        return;
      }
      const durationMs = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.displayPercent.set(Math.round(target * eased));
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          this.displayPercent.set(target);
          window.setTimeout(resolve, 300);
        }
      };
      requestAnimationFrame(tick);
    });
  }
}
