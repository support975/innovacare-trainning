import { Component, computed, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  FieldPath,
  doc,
  getDoc,
  collection,
  collectionData,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth';
import { ProctorService } from '../../../data/proctor.service';
import { ExamSessionAuthService } from '../../../data/exam-session-auth.service';
import { KioskService } from '../../../data/kiosk.service';

type HonorLabel = 'Pass' | 'Merit' | 'Honors' | 'High Honors';

type GradeExamRequest = {
  courseId: string;
  examId: string;
  answers: Record<string, string[]>;
  officialApplicationId?: string;
  certificationSessionId?: string;
};

type GradeExamResult = {
  total: number;
  correct: number;
  percent: number;
  passPct: number;
  passed: boolean;
  honor?: HonorLabel;
  details: Array<{
    id: string;
    order: number;
    prompt: string;
    your: string[];
    correct: string[];
    isCorrect: boolean;
    explanation?: string;
  }>;
};

@Component({
  selector: 'app-exam-runner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './exam-runner.html',
  styleUrls: ['./exam-runner.css'],
})
export class ExamRunnerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private authService = inject(AuthService);
  private proctorService = inject(ProctorService);
  private examSessionAuthService = inject(ExamSessionAuthService);
  private kioskService = inject(KioskService);
  private profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly isIndividualLearner = computed(() => {
    const p = this.profile();
    return p?.accountType === 'individual' && !p?.orgId;
  });

  courseId = '';
  examId = '';
  officialApplicationId = '';
  certificationSessionId = '';
  sessionId = '';
  sessionToken = '';

  notice = signal('');
  officialAccessApproved = signal(true);
  proctorVerificationRequired = signal(false);
  proctorVerificationApproved = signal(false);
  lockedMode = signal(false);  // true = onsite exam, no admin access
  draftStatus = signal('');
  savingDraft = signal(false);
  busy = signal(false);
  phase = signal<'questions' | 'review' | 'scoring' | 'results'>('questions');
  currentQuestionIndex = signal(0);
  displayPercent = signal(0);

  examMeta = signal<any | null>(null);
  questions = signal<any[]>([]);
  answerRevision = signal(0);
  // Map<questionId, Set<optionId>>
  answers = new Map<string, Set<string>>();
  private draftSaveTimer?: ReturnType<typeof setTimeout>;

  // Flag for review
  flagRevision = signal(0);
  flagged = new Set<string>();

  // Countdown timer
  private examStartedAt: number | null = null;
  private timerHandle?: ReturnType<typeof setInterval>;
  remainingSeconds = signal<number | null>(null);
  readonly durationMinutes = computed(() => {
    const explicit = Number(this.examMeta()?.durationMinutes);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const total = this.totalQuestions();
    return total > 0 ? Math.max(30, Math.round(total * 1.5)) : 60;
  });
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

  // ✅ UI extras (avoid TS errors)
  percent = signal<number>(0);
  honorLabel = signal<HonorLabel>('Pass');
  readonly passThreshold = computed(() => Number(this.examMeta()?.passPct ?? 80));
  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentQuestionIndex()] ?? null);
  readonly progressPercent = computed(() => {
    const total = this.totalQuestions();
    if (!total) return 0;
    return Math.round(((this.currentQuestionIndex() + 1) / total) * 100);
  });
  readonly answeredCount = computed(() => {
    this.answerRevision();
    return this.questions().filter((q) => (this.answers.get(q.id)?.size ?? 0) > 0).length;
  });
  readonly currentAnswered = computed(() => {
    this.answerRevision();
    const q = this.currentQuestion();
    return q ? (this.answers.get(q.id)?.size ?? 0) > 0 : false;
  });
  readonly isLastQuestion = computed(() => this.currentQuestionIndex() >= this.totalQuestions() - 1);

  result = signal<{
    total: number;
    correct: number;
    percent: number;
    passed: boolean;
    details: Array<{
      id: string;
      order: number;
      prompt: string;
      your: string[];
      correct: string[];
      isCorrect: boolean;
      explanation?: string;
    }>;
  } | null>(null);

  ngOnInit() {
    this.courseId = readParamDeep(this.route, 'courseId');
    this.examId = readParamDeep(this.route, 'examId');
    this.officialApplicationId = readParamDeep(this.route, 'officialApplicationId');
    this.certificationSessionId = readParamDeep(this.route, 'certificationSessionId');
    this.sessionId = readParamDeep(this.route, 'sessionId');
    this.sessionToken = readParamDeep(this.route, 'token');

    const lockedModeParam = this.route.snapshot.queryParamMap.get('lockedMode');
    if (lockedModeParam === 'true') {
      this.lockedMode.set(true);
    }

    if (!this.courseId || !this.examId) {
      this.notice.set('Invalid URL (missing course or exam id).');
      return;
    }

    // If locked mode + token, verify session token before proceeding
    if (this.lockedMode() && (this.sessionId && this.sessionToken)) {
      void this.validateSessionToken();
      // Enable kiosk mode (prevent navigation, copy, etc.)
      this.kioskService.enableKiosk(this.sessionId);
    }

    this.loadExam();
    this.loadQuestions();
    this.loadSavedAnswers();
    if (this.sessionId && !this.lockedMode()) {
      void this.validateProctorVerification();
    }
  }

  ngOnDestroy(): void {
    if (this.draftSaveTimer) {
      clearTimeout(this.draftSaveTimer);
    }
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
    }

    // Disable kiosk mode when component destroys
    if (this.lockedMode()) {
      this.kioskService.disableKiosk();
      this.examSessionAuthService.clearToken();
    }
  }

  // Prevent navigation away from exam in locked mode
  canDeactivate(): boolean {
    if (!this.lockedMode() || this.phase() === 'results') {
      return true;
    }

    if (this.phase() === 'questions' || this.phase() === 'review') {
      // In locked mode, prevent navigation during exam
      console.warn('Cannot navigate away from onsite exam.');
      return false;
    }

    return true;
  }

  private questionsLoaded = false;
  private answersRestored = false;

  private maybeStartTimer(): void {
    if (this.questionsLoaded && this.answersRestored) {
      this.startTimerIfNeeded();
    }
  }

  private startTimerIfNeeded(): void {
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

  toggleFlag(qid: string): void {
    if (this.flagged.has(qid)) {
      this.flagged.delete(qid);
    } else {
      this.flagged.add(qid);
    }
    this.flagRevision.update((v) => v + 1);
    this.scheduleSaveAnswers();
  }

  isFlagged(qid: string): boolean {
    this.flagRevision();
    return this.flagged.has(qid);
  }

  readonly flaggedCount = computed(() => {
    this.flagRevision();
    return this.flagged.size;
  });

  readonly unansweredCount = computed(() => this.totalQuestions() - this.answeredCount());

  questionStatus(q: any): 'answered' | 'flagged' | 'answered-flagged' | 'unanswered' {
    this.answerRevision();
    this.flagRevision();
    const answered = (this.answers.get(q.id)?.size ?? 0) > 0;
    const flagged = this.flagged.has(q.id);
    if (answered && flagged) return 'answered-flagged';
    if (flagged) return 'flagged';
    if (answered) return 'answered';
    return 'unanswered';
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

  private loadExam() {
    const ref = doc(this.afs, `courses/${this.courseId}/exams/${this.examId}`);
    getDoc(ref)
      .then((snap) => {
        if (!snap.exists()) {
          this.notice.set('Exam not found.');
          return;
        }
        const meta = { id: snap.id, ...snap.data() };
        this.examMeta.set(meta);
        void this.validateOfficialExamAccess(meta);
      })
      .catch((err) => this.notice.set(err?.message || 'Failed to load exam.'));
  }

  private async validateOfficialExamAccess(meta: any): Promise<void> {
    if (meta?.officialAccessRequired !== true) {
      this.officialAccessApproved.set(true);
      return;
    }

    this.officialAccessApproved.set(false);
    const user = await this.currentUser();
    if (!user || !this.officialApplicationId) {
      this.notice.set('This official exam requires an approved candidate application.');
      return;
    }

    try {
      const appRef = doc(this.afs, `candidateApplications/${this.officialApplicationId}`);
      const snap = await getDoc(appRef);
      const application = snap.exists() ? (snap.data() as any) : null;
      const statusOk = ['eligible', 'approved_for_exam'].includes(String(application?.status || ''));
      const sessionOk = !this.certificationSessionId || application?.sessionId === this.certificationSessionId;
      if (application?.candidateUserId !== user.uid || !statusOk || !sessionOk) {
        this.notice.set('This official exam requires an approved candidate application.');
        return;
      }

      this.officialAccessApproved.set(true);
      this.notice.set('');
    } catch (err: any) {
      this.notice.set(err?.message || 'Unable to verify official exam access.');
    }
  }

  private async validateSessionToken(): Promise<void> {
    if (!this.sessionId || !this.sessionToken) {
      this.notice.set('Session token missing.');
      return;
    }

    try {
      const isValid = await this.examSessionAuthService.verifyToken(this.sessionId, this.sessionToken);
      if (!isValid) {
        this.notice.set('Session expired or invalid. Please log in again.');
        await this.router.navigate(['/exam-session-login'], {
          queryParams: { sessionId: this.sessionId },
        });
        return;
      }
      // Token valid - allow exam to proceed
    } catch (err: any) {
      this.notice.set(err?.message || 'Failed to verify session token.');
    }
  }

  private async validateProctorVerification(): Promise<void> {
    if (!this.sessionId) {
      this.proctorVerificationApproved.set(true);
      return;
    }

    const user = await this.currentUser();
    if (!user) {
      this.proctorVerificationRequired.set(true);
      this.notice.set('Please sign in first.');
      return;
    }

    try {
      const session = await new Promise<any>((resolve) => {
        getDoc(doc(this.afs, `examSessions/${this.sessionId}`)).then((snap) => {
          resolve(snap.exists() ? snap.data() : null);
        });
      });

      if (!session?.requireIdentityVerification) {
        this.proctorVerificationApproved.set(true);
        return;
      }

      this.proctorVerificationRequired.set(true);

      const verified = await this.proctorService.isCandidateVerifiedToday(this.sessionId, user.uid);
      if (verified) {
        this.proctorVerificationApproved.set(true);
        this.notice.set('');
      } else {
        this.notice.set('Awaiting proctor identity verification. Please inform a supervisor.');
        this.proctorVerificationApproved.set(false);
      }
    } catch (err: any) {
      this.notice.set(err?.message || 'Unable to verify proctor status.');
    }
  }

  private loadQuestions() {
    const colRef = collection(
      this.afs,
      `courses/${this.courseId}/exams/${this.examId}/questions`
    );
    collectionData(colRef, { idField: 'id' }).subscribe({
      next: (qs: any[]) => {
        this.questions.set(qs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
        this.questionsLoaded = true;
        this.maybeStartTimer();
      },
      error: (e) => this.notice.set(e?.message || 'Failed to load questions.'),
    });
  }

  toggleOption(qid: string, optId: string, mode: 'single' | 'multi') {
    if (mode === 'single') {
      this.answers.set(qid, new Set([optId]));
      this.answerRevision.update((value) => value + 1);
      this.scheduleSaveAnswers();
      return;
    }
    const set = this.answers.get(qid) ?? new Set<string>();
    if (set.has(optId)) set.delete(optId);
    else set.add(optId);
    this.answers.set(qid, set);
    this.answerRevision.update((value) => value + 1);
    this.scheduleSaveAnswers();
  }

  isSelected(qid: string, optId: string): boolean {
    this.answerRevision();
    return this.answers.get(qid)?.has(optId) || false;
  }

  letterFor(index: number): string {
    return String.fromCharCode(65 + index);
  }

  goToPreviousQuestion(): void {
    this.notice.set('');
    this.currentQuestionIndex.update((index) => Math.max(0, index - 1));
    this.scheduleSaveAnswers();
  }

  goToNextQuestion(): void {
    this.notice.set('');
    this.currentQuestionIndex.update((index) => Math.min(this.totalQuestions() - 1, index + 1));
    this.scheduleSaveAnswers();
  }

  goToQuestion(index: number): void {
    this.notice.set('');
    this.currentQuestionIndex.set(Math.max(0, Math.min(this.totalQuestions() - 1, index)));
    this.scheduleSaveAnswers();
  }

  retakeExam(): void {
    this.answers.clear();
    this.flagged.clear();
    this.flagRevision.update((v) => v + 1);
    this.answerRevision.update((value) => value + 1);
    this.result.set(null);
    this.percent.set(0);
    this.displayPercent.set(0);
    this.honorLabel.set('Pass');
    this.currentQuestionIndex.set(0);
    this.phase.set('questions');
    this.notice.set('');
    this.examStartedAt = Date.now();
    this.startTimerIfNeeded();
    this.scheduleSaveAnswers();
  }

  goToTranscript(): void {
    this.router.navigate(['/learner/transcript'], {
      queryParams: { courseId: this.courseId, examId: this.examId },
    });
  }

  async submit() {
    if (!this.courseId || !this.examId) {
      this.notice.set('Invalid URL (missing course or exam id).');
      return;
    }
    if (this.examMeta()?.officialAccessRequired === true && !this.officialAccessApproved()) {
      this.notice.set('This official exam requires an approved candidate application.');
      return;
    }
    if (this.proctorVerificationRequired() && !this.proctorVerificationApproved()) {
      this.notice.set('Awaiting proctor identity verification. Please inform a supervisor.');
      return;
    }

    this.notice.set('');
    this.result.set(null);
    this.phase.set('scoring');
    this.displayPercent.set(0);
    this.stopTimer();

    const user =
      this.auth.currentUser ??
      (await new Promise<import('@firebase/auth').User | null>((resolve) => {
        const unsub = this.auth.onAuthStateChanged((u) => {
          unsub();
          resolve(u);
        });
      }));

    if (!user) {
      this.notice.set('Please sign in first.');
      this.phase.set('questions');
      return;
    }

    this.busy.set(true);

    try {
      await this.saveAnswersDraft(true);
      const answersObj = this.collectAnswers();

      const graded = await this.submitExamForGrading(user.uid, {
        courseId: this.courseId,
        examId: this.examId,
        answers: answersObj,
        ...(this.officialApplicationId ? { officialApplicationId: this.officialApplicationId } : {}),
        ...(this.certificationSessionId ? { certificationSessionId: this.certificationSessionId } : {}),
      });

      const percent = graded.percent;
      this.percent.set(percent);

      const honor: HonorLabel = graded.honor ?? (
        percent >= 95 ? 'High Honors' :
        percent >= 90 ? 'Honors' :
        percent >= 80 ? 'Merit' : 'Pass'
      );
      this.honorLabel.set(honor);

      const passed = !!graded.passed;

      this.result.set({
        total: graded.total,
        correct: graded.correct,
        percent,
        passed,
        details: graded.details,
      });

      await this.animateScore(percent);
      this.phase.set('results');

      // In kiosk mode, return to login after viewing results briefly
      if (this.lockedMode()) {
        window.setTimeout(() => {
          this.kioskService.returnToLogin(this.sessionId);
        }, 3000); // Show results for 3 seconds
      } else if (passed) {
        window.setTimeout(() => this.goToTranscript(), 2400);
      }
    } catch (e: any) {
      console.error(e);
      this.notice.set(
        e?.message ||
          'Failed to grade exam.'
      );
      this.phase.set('questions');
      this.startTimerIfNeeded();
    } finally {
      this.busy.set(false);
    }
  }

  async saveAnswersNow(): Promise<void> {
    await this.saveAnswersDraft(true);
  }

  private async loadSavedAnswers(): Promise<void> {
    const user = await this.currentUser();
    if (!user || !this.courseId || !this.examId) {
      this.answersRestored = true;
      this.maybeStartTimer();
      return;
    }

    try {
      const enrollmentRef = doc(this.afs, `users/${user.uid}/enrollments/${this.courseId}`);
      const snap = await getDoc(enrollmentRef);
      const draft = (snap.data() as any)?.examDrafts?.[this.examId];
      if (!draft?.answers || typeof draft.answers !== 'object') return;

      this.answers.clear();
      for (const [questionId, values] of Object.entries(draft.answers)) {
        if (Array.isArray(values)) {
          this.answers.set(questionId, new Set(values.map(String)));
        }
      }

      if (Array.isArray(draft.flagged)) {
        this.flagged = new Set(draft.flagged.map(String));
        this.flagRevision.update((v) => v + 1);
      }

      const savedStartedAt = Number(draft.startedAt);
      if (Number.isFinite(savedStartedAt) && savedStartedAt > 0) {
        this.examStartedAt = savedStartedAt;
      }

      const savedIndex = Number(draft.currentQuestionIndex ?? 0);
      if (Number.isFinite(savedIndex)) {
        this.currentQuestionIndex.set(Math.max(0, savedIndex));
      }

      this.answerRevision.update((value) => value + 1);
      this.setDraftStatus('Saved answers restored.');
    } catch (error) {
      console.warn('Could not restore exam draft answers.', error);
    } finally {
      this.answersRestored = true;
      this.maybeStartTimer();
    }
  }

  private scheduleSaveAnswers(): void {
    if (this.phase() !== 'questions' && this.phase() !== 'review') return;
    this.draftStatus.set('Saving answers...');
    if (this.draftSaveTimer) {
      clearTimeout(this.draftSaveTimer);
    }
    this.draftSaveTimer = setTimeout(() => void this.saveAnswersDraft(), 500);
  }

  private async saveAnswersDraft(manual = false): Promise<void> {
    const user = await this.currentUser();
    if (!user || !this.courseId || !this.examId) return;

    if (this.savingDraft()) {
      if (manual) this.setDraftStatus('Save already in progress.');
      return;
    }

    this.savingDraft.set(true);
    if (manual) this.draftStatus.set('Saving answers...');

    try {
      const enrollmentRef = doc(this.afs, `users/${user.uid}/enrollments/${this.courseId}`);
      const draft = {
        courseId: this.courseId,
        examId: this.examId,
        answers: this.collectAnswers(),
        flagged: Array.from(this.flagged),
        startedAt: this.examStartedAt ?? Date.now(),
        currentQuestionIndex: this.currentQuestionIndex(),
        totalQuestions: this.totalQuestions(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(
        enrollmentRef,
        new FieldPath('examDrafts', this.examId),
        draft,
        'updatedAt',
        serverTimestamp()
      );

      this.setDraftStatus(manual ? 'Answers saved.' : 'Answers saved automatically.');
    } catch (error) {
      console.error('Could not save exam draft answers.', error);
      this.setDraftStatus('Unable to save answers right now.');
    } finally {
      this.savingDraft.set(false);
    }
  }

  private collectAnswers(): Record<string, string[]> {
    const answersObj: Record<string, string[]> = {};
    for (const q of this.questions()) {
      answersObj[q.id] = Array.from(this.answers.get(q.id) || []);
    }
    return answersObj;
  }

  private async submitExamForGrading(
    uid: string,
    payload: GradeExamRequest
  ): Promise<GradeExamResult> {
    const submissionRef = doc(collection(this.afs, `users/${uid}/examSubmissions`));
    await setDoc(submissionRef, {
      uid,
      ...payload,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        unsubscribe();
        reject(new Error('Exam grading is taking longer than expected. Your answers were saved.'));
      }, 45000);

      const unsubscribe = onSnapshot(
        submissionRef,
        (snap) => {
          const data = snap.data() as any;
          if (!data) return;

          if (data.status === 'graded' && data.result) {
            window.clearTimeout(timeout);
            unsubscribe();
            resolve(data.result as GradeExamResult);
          }

          if (data.status === 'failed') {
            window.clearTimeout(timeout);
            unsubscribe();
            reject(new Error(data.error?.message || 'Failed to grade exam.'));
          }
        },
        (error) => {
          window.clearTimeout(timeout);
          unsubscribe();
          reject(error);
        }
      );
    });
  }

  private currentUser(): Promise<import('@firebase/auth').User | null> {
    if (this.auth.currentUser) return Promise.resolve(this.auth.currentUser);

    return new Promise((resolve) => {
      const unsub = this.auth.onAuthStateChanged((user) => {
        unsub();
        resolve(user);
      });
    });
  }

  private setDraftStatus(message: string): void {
    this.draftStatus.set(message);
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      if (this.draftStatus() === message) {
        this.draftStatus.set('');
      }
    }, 2800);
  }

  private animateScore(target: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        this.displayPercent.set(target);
        resolve();
        return;
      }

      const durationMs = 1500;
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.displayPercent.set(Math.round(target * eased));
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          this.displayPercent.set(target);
          window.setTimeout(resolve, 350);
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

/** Walk current route → parents → query params to find a param by key */
function readParamDeep(route: ActivatedRoute, key: string): string {
  const here = route.snapshot.paramMap.get(key);
  if (here) return here;

  let p = route.parent;
  while (p) {
    const v = p.snapshot.paramMap.get(key);
    if (v) return v;
    p = p.parent!;
  }
  return route.snapshot.queryParamMap.get(key) ?? '';
}
