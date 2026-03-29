import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  collection,
  collectionData,
  getDocs,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

import { EnrollmentService } from '../../../shared/services/enrollement';
import { RewardsService } from '../../../shared/services/rewards';

type HonorLabel = 'Pass' | 'Merit' | 'Honors' | 'High Honors';

@Component({
  selector: 'app-exam-runner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './exam-runner.html',
  styleUrls: ['./exam-runner.css'],
})
export class ExamRunnerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private enrollSvc = inject(EnrollmentService);
  private rewardsSvc = inject(RewardsService);

  courseId = '';
  examId = '';

  notice = signal('');
  busy = signal(false);

  examMeta = signal<any | null>(null);
  questions = signal<any[]>([]);
  // Map<questionId, Set<optionId>>
  answers = new Map<string, Set<string>>();

  // ✅ UI extras (avoid TS errors)
  percent = signal<number>(0);
  honorLabel = signal<HonorLabel>('Pass');

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

    if (!this.courseId || !this.examId) {
      this.notice.set('Invalid URL (missing course or exam id).');
      return;
    }

    this.loadExam();
    this.loadQuestions();
  }

  private loadExam() {
    const ref = doc(this.afs, `courses/${this.courseId}/exams/${this.examId}`);
    getDoc(ref)
      .then((snap) => {
        if (!snap.exists()) {
          this.notice.set('Exam not found.');
          return;
        }
        this.examMeta.set({ id: snap.id, ...snap.data() });
      })
      .catch((err) => this.notice.set(err?.message || 'Failed to load exam.'));
  }

  private loadQuestions() {
    const colRef = collection(
      this.afs,
      `courses/${this.courseId}/exams/${this.examId}/questions`
    );
    collectionData(colRef, { idField: 'id' }).subscribe({
      next: (qs: any[]) =>
        this.questions.set(qs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
      error: (e) => this.notice.set(e?.message || 'Failed to load questions.'),
    });
  }

  toggleOption(qid: string, optId: string, mode: 'single' | 'multi') {
    if (mode === 'single') {
      this.answers.set(qid, new Set([optId]));
      return;
    }
    const set = this.answers.get(qid) ?? new Set<string>();
    if (set.has(optId)) set.delete(optId);
    else set.add(optId);
    this.answers.set(qid, set);
  }

  async submit() {
    if (!this.courseId || !this.examId) {
      this.notice.set('Invalid URL (missing course or exam id).');
      return;
    }

    this.notice.set('');
    this.result.set(null);

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
      return;
    }

    this.busy.set(true);

    try {
      // 1) collect user answers
      const answersObj: Record<string, string[]> = {};
      for (const q of this.questions()) {
        answersObj[q.id] = Array.from(this.answers.get(q.id) || []);
      }

      // 2) load answerKey
      const keyCol = collection(
        this.afs,
        `courses/${this.courseId}/exams/${this.examId}/answerKey`
      );
      const keySnap = await getDocs(keyCol);

      const keyMap = new Map<string, string[]>();
      keySnap.forEach((d) => {
        const arr = Array.isArray(d.get('correctIds'))
          ? (d.get('correctIds') as string[])
          : [];
        keyMap.set(d.id, arr);
      });

      // 3) grade
      const eq = (a: string[], b: string[]) => {
        if (a.length !== b.length) return false;
        const as = [...a].sort();
        const bs = [...b].sort();
        for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
        return true;
      };

      const qs = this.questions();
      let total = 0;
      let correctCount = 0;

      const details: Array<{
        id: string;
        order: number;
        prompt: string;
        your: string[];
        correct: string[];
        isCorrect: boolean;
        explanation?: string;
      }> = [];

      for (const q of qs) {
        const your = answersObj[q.id] || [];
        const corr = keyMap.get(q.id) || [];
        const ok = eq(your, corr);

        total += 1;
        if (ok) correctCount += 1;

        details.push({
          id: q.id,
          order: q.order ?? 0,
          prompt: q.prompt ?? '',
          your,
          correct: corr,
          isCorrect: ok,
          explanation: q.explanation,
        });
      }

      // ✅ local percent only (no TS errors)
      const percent = total ? Math.round((correctCount / total) * 100) : 0;
      this.percent.set(percent);

      const honor: HonorLabel =
        percent >= 95 ? 'High Honors' :
        percent >= 90 ? 'Honors' :
        percent >= 80 ? 'Merit' : 'Pass';
      this.honorLabel.set(honor);

      const passPct = Number(this.examMeta()?.passPct ?? 80);
      const passed = percent >= passPct;

      // 4) persist completion + score (if passed)
      if (passed) {
        // Preferred: your custom method
        const anyEnroll = this.enrollSvc as any;

        try {
          if (typeof anyEnroll.markCompletedWithScore === 'function') {
            await anyEnroll.markCompletedWithScore({
              uid: user.uid,
              courseId: this.courseId,
              score: percent,
              passed: true,
              examId: this.examId,
              passPct,
              total,
              correct: correctCount,
            });
          } else {
            // Fallback: write score + completed fields (merge)
            const enrRef = doc(this.afs, `users/${user.uid}/enrollments/${this.courseId}`);
            await setDoc(
              enrRef,
              {
                courseId: this.courseId,
                status: 'completed',
                score: percent,
                completedAt: serverTimestamp(),
                lastExamId: this.examId,
                passPct,
                total,
                correct: correctCount,
              },
              { merge: true }
            );
          }
        } catch {
          // ignore if rules block
        }

        // 5) rewards (best-effort)
        try {
          const anyRewards = this.rewardsSvc as any;
          if (typeof anyRewards.awardCourseCompletion === 'function') {
            await anyRewards.awardCourseCompletion({
              uid: user.uid,
              courseId: this.courseId,
              score: percent,
              honor,
              examId: this.examId,
            });
          }
        } catch {
          // ignore
        }
      }

      // 6) set result
      this.result.set({
        total,
        correct: correctCount,
        percent,
        passed,
        details,
      });

      // 7) redirect to certifications only if passed
      if (passed) {
        this.router.navigate(['/learner/certifications'], {
          queryParams: { courseId: this.courseId, examId: this.examId },
        });
      }
    } catch (e: any) {
      console.error(e);
      this.notice.set(
        e?.message ||
          'Failed to grade exam. (If answerKey is staff-only, enable Cloud Function grading.)'
      );
    } finally {
      this.busy.set(false);
    }
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
