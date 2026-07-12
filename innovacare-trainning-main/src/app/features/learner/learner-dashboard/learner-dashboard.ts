import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, docData, query, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { LanguageService } from '../../../shared/services/language';

type DueStats = { overdue: number; in7: number; in30: number; in90: number };
type EnrollmentStatus = 'assigned' | 'started' | 'completed';

interface EnrollmentDoc {
  courseId: string;
  status: EnrollmentStatus;
  // optional timestamps (Firestore Timestamp | number ms)
  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;
  // optional per-learner deadline (ISO string)
  dueDate?: string;
}

interface CourseDoc {
  id?: string;
  title?: string;
  kind?: 'Course' | 'Text' | 'Module';
  durationMin?: number;
  url?: string;
  // optional global deadline (ISO string)
  dueDate?: string;
}

interface RecentItem {
  title: string;
  type: string;
  duration: string;
  date: string;
  link: string;
  ts: number;
}

interface LearnerNextAction {
  courseId: string;
  title: string;
  status: EnrollmentStatus;
  kind: string;
  duration: string;
  due: string;
  dueTs: number;
  isOverdue: boolean;
  cta: string;
}

type CompletionSummary = {
  total: number;
  completed: number;
  active: number;
  assigned: number;
  percent: number;
};

// ---- Helpers ----
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') { const t = Date.parse(x); return isNaN(t) ? undefined : t; }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  return undefined;
}
function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function courseDurationLabel(course: CourseDoc): string {
  const durationMin = course.durationMin ?? 0;
  const hrs = Math.floor(durationMin / 60);
  const mins = durationMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}min` : `${mins}min`;
}

function dueTimestamp(enr: EnrollmentDoc, course: CourseDoc): number {
  const now = Date.now();
  const assignedTs = epochMs(enr.assignedAt) ?? now;
  return firstDefined(
    epochMs(enr.dueDate),
    epochMs(course?.dueDate),
    assignedTs + DEFAULT_DUE_DAYS * DAY
  ) ?? assignedTs + DEFAULT_DUE_DAYS * DAY;
}

@Component({
  standalone: true,
  selector: 'app-learner-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './learner-dashboard.html',
  styleUrls: ['./learner-dashboard.css'],
})
export class LearnerDashboardComponent {
  private auth = inject(Auth);
  private authService = inject(AuthService);
  private afs = inject(Firestore);
  private languageService = inject(LanguageService);
  private profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);
  readonly isIndividualLearner = computed(() => {
    const p = this.profile();
    return p?.accountType === 'individual' && !p?.orgId;
  });

  // ---------------- Display name ----------------
  private auth$ = authState(this.auth);
  private displayName$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of('Learner');
      const fromAuth = user.displayName?.trim();
      if (fromAuth) return of(fromAuth);
      const uref = doc(this.afs, `users/${user.uid}`);
      return docData(uref).pipe(map((u: any) => u?.displayName || 'Learner'));
    })
  );
  private role$ = this.auth$.pipe(
    map(user => (user ? 'Learner' : 'Guest'))
  );
  displayName = toSignal(this.displayName$, { initialValue: 'Learner' });
  role = toSignal(this.role$, { initialValue: 'Learner' });

  // ------------- Enrollments joined with Courses -------------
  private rows$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of([] as Array<{ enr: EnrollmentDoc; course: CourseDoc }>);
      const enrCol = collection(this.afs, `users/${user.uid}/enrollments`);
      return collectionData(enrCol, { idField: 'id' }).pipe(
        switchMap((enrs) => {
          const list = (enrs as EnrollmentDoc[]);
          if (!list.length) return of([] as Array<{ enr: EnrollmentDoc; course: CourseDoc }>);
          const perCourse$ = list.map(enr => {
            const cref = doc(this.afs, `courses/${enr.courseId}`);
            return docData(cref, { idField: 'id' }).pipe(
              map(c => ({ enr, course: (c || {}) as CourseDoc }))
            );
          });
          return combineLatest(perCourse$);
        })
      );
    })
  );

  // ---------------- KPIs (Overdue / 7 / 30 / 90) ----------------
  private dueStats$ = this.rows$.pipe(
    map(rows => {
      const now = Date.now();
      let overdue = 0, in7 = 0, in30 = 0, in90 = 0;

      for (const { enr, course } of rows) {
        if (enr.status === 'completed') continue;

        // Priority: enrollment.dueDate -> course.dueDate -> assignedAt + 30d
        const enrDue = epochMs(enr.dueDate);
        const courseDue = epochMs(course?.dueDate);
        const assignedTs = epochMs(enr.assignedAt) ?? now;
        const inferredDue = assignedTs + DEFAULT_DUE_DAYS * DAY;

        const dueTs = firstDefined(enrDue, courseDue, inferredDue);
        if (!dueTs) continue;

        if (dueTs < now) { overdue++; continue; }
        const delta = dueTs - now;
        if (delta <= 7 * DAY) in7++;
        else if (delta <= 30 * DAY) in30++;
        else if (delta <= 90 * DAY) in90++;
      }

      return { overdue, in7, in30, in90 } as DueStats;
    })
  );
  due = toSignal(this.dueStats$, { initialValue: { overdue: 0, in7: 0, in30: 0, in90: 0 } });

  private completionSummary$ = this.rows$.pipe(
    map(rows => {
      const total = rows.length;
      const completed = rows.filter(({ enr }) => enr.status === 'completed').length;
      const active = rows.filter(({ enr }) => enr.status === 'started').length;
      const assigned = rows.filter(({ enr }) => enr.status === 'assigned').length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      return { total, completed, active, assigned, percent } satisfies CompletionSummary;
    })
  );
  completionSummary = toSignal(this.completionSummary$, {
    initialValue: { total: 0, completed: 0, active: 0, assigned: 0, percent: 0 } as CompletionSummary,
  });

  private focusQueue$ = this.rows$.pipe(
    map(rows => {
      const now = Date.now();
      return rows
        .filter(({ enr }) => enr.status !== 'completed')
        .map(({ enr, course }) => {
          const dueTs = dueTimestamp(enr, course);
          const courseId = course.id ?? enr.courseId;
          const item: LearnerNextAction = {
            courseId,
            title: course.title ?? '(Untitled course)',
            status: enr.status,
            kind: course.kind ?? 'Course',
            duration: courseDurationLabel(course),
            due: this.dueLabel(enr, course),
            dueTs,
            isOverdue: dueTs < now,
            cta: enr.status === 'started' ? 'Resume' : 'Start',
          };
          return item;
        })
        .sort((a, b) => {
          if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
          if (a.status !== b.status) return a.status === 'started' ? -1 : 1;
          return a.dueTs - b.dueTs;
        });
    })
  );
  focusQueue = toSignal(this.focusQueue$, { initialValue: [] as LearnerNextAction[] });
  nextAction = toSignal(
    this.focusQueue$.pipe(map<LearnerNextAction[], LearnerNextAction | null>(items => items[0] ?? null)),
    { initialValue: null as LearnerNextAction | null }
  );

  // ---------------- Recent activity (top 5) ----------------
  private recent$ = this.rows$.pipe(
    map(rows => {
      const items: RecentItem[] = [];

      for (const { enr, course } of rows) {
        const ts =
          epochMs(enr.completedAt) ??
          epochMs(enr.startedAt) ??
          epochMs(enr.assignedAt) ??
          Date.now();

        items.push({
          title: course.title ?? '(Untitled course)',
          type: course.kind ?? 'Course',
          duration: courseDurationLabel(course),
          date: new Date(ts).toLocaleDateString(),
          link: `/learner/courses/${course.id ?? ''}`,
          ts
        });
      }

      return items.sort((a, b) => b.ts - a.ts).slice(0, 5);
    })
  );
  recent = toSignal(this.recent$, { initialValue: [] as RecentItem[] });

  // ---------------- Official exam results (onsite/kiosk attempts) ----------------
  private examAttempts$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of([] as any[]);
      const q = query(collection(this.afs, 'examAttempts'), where('candidateUid', '==', user.uid));
      return collectionData(q, { idField: 'id' });
    }),
    map(list =>
      [...(list as any[])].sort(
        (a, b) => (epochMs(b['completedAt']) ?? 0) - (epochMs(a['completedAt']) ?? 0)
      )
    )
  );
  examAttempts = toSignal(this.examAttempts$, { initialValue: [] as any[] });

  examAttemptDate(a: any): string {
    const ms = epochMs(a?.completedAt);
    return ms ? new Date(ms).toLocaleDateString() : '';
  }

  // ---------------- Static links/resources ----------------
  private allLinks = [
    { label: 'Home', path: '/learner', active: true },
    { label: 'Assignments', path: '/learner/assignments' },
    { label: 'Licenses & Certifications', path: '/learner/certifications' },
    { label: 'Course Library', path: '/learner/library' },
    { label: 'Transcript', path: '/learner/transcript' },
    { label: 'Rewards', path: '/learner/rewards' },
  ];

  links = computed(() =>
    this.isIndividualLearner()
      ? this.allLinks.filter((link) =>
          ['/learner', '/learner/assignments', '/learner/transcript', '/learner/rewards']
            .includes(link.path)
        )
      : this.allLinks
  );

  resources = computed(() => this.isIndividualLearner() ? [] : [
    { label: 'Policies & Procedures', path: '/resources/policies' },
  ]);

  // -------- User profile stats (organization, role fields only) --------
  private userStats$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of(null);
      const uref = doc(this.afs, `users/${user.uid}`);
      return docData(uref);
    })
  );
  userStats = toSignal(this.userStats$, { initialValue: null as any });

  // -------- Points wallet (awarded by the rewards engine at
  // users/{uid}/wallet/main -- NOT a field on the user doc itself) --------
  private wallet$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of({ totalPoints: 0 } as any);
      return docData(doc(this.afs, `users/${user.uid}/wallet/main`));
    })
  );
  totalPoints = toSignal(
    this.wallet$.pipe(map((w: any) => Number(w?.totalPoints ?? 0))),
    { initialValue: 0 }
  );

  // -------- Rewards (badges + point grants), users/{uid}/rewards/{id} --------
  private rewards$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of([] as any[]);
      const rcol = collection(this.afs, `users/${user.uid}/rewards`);
      return collectionData(rcol, { idField: 'id' });
    })
  );
  rewardsList = toSignal(this.rewards$, { initialValue: [] as any[] });

  // -------- Gamification level from points --------
  levelFromPoints = computed(() => {
    const points = this.totalPoints();
    if (points >= 5000) return { name: 'Legend 🏆', level: 5, color: '#FFD700' };
    if (points >= 3000) return { name: 'Platinum 💎', level: 4, color: '#E5E4E2' };
    if (points >= 1500) return { name: 'Gold 🥇', level: 3, color: '#FFD700' };
    if (points >= 500) return { name: 'Silver 🥈', level: 2, color: '#C0C0C0' };
    return { name: 'Bronze 🥉', level: 1, color: '#CD7F32' };
  });

  // -------- Learning stats: total hours, completion rate --------
  learningStats = computed(() => {
    const rows = this.rows();
    const totalMinutes = rows.reduce((sum, r) => sum + (r.course.durationMin || 0), 0);
    const totalHours = Math.round(totalMinutes / 60);
    const completed = rows.filter(r => r.enr.status === 'completed').length;
    const total = rows.length || 1;
    const completionRate = Math.round((completed / total) * 100);
    return { totalHours, completed, total, completionRate };
  });

  // -------- Recent badges earned (type === 'badge' reward docs) --------
  badges = computed(() =>
    this.rewardsList()
      .filter((r: any) => r.type === 'badge')
      .map((r: any) => ({
        icon: '🎖️',
        name: r.title || 'Badge',
        description: r.points ? `+${r.points} pts` : '',
      }))
  );

  // -------- Points progress to next level --------
  pointsProgress = computed(() => {
    const points = this.totalPoints();
    const level = this.levelFromPoints();
    const levels = [0, 500, 1500, 3000, 5000];
    const currentIdx = level.level - 1;
    const nextIdx = currentIdx + 1;
    const currentThreshold = levels[currentIdx];
    const nextThreshold = levels[nextIdx] || 5000;
    const progressInBand = Math.max(0, Math.min(nextThreshold - currentThreshold, points - currentThreshold));
    const bandWidth = nextThreshold - currentThreshold;
    const percent = Math.round((progressInBand / bandWidth) * 100);
    const pointsToNext = Math.max(0, nextThreshold - points);
    return { percent, pointsToNext, nextThreshold };
  });

  rows = toSignal(
    this.rows$, { initialValue: [] as Array<{ enr: EnrollmentDoc; course: CourseDoc }> }
);

// petit helper d’affichage
dueLabel(enr: EnrollmentDoc, course: CourseDoc): string {
  const now = Date.now();
  const enrDue = epochMs(enr.dueDate);
  const courseDue = epochMs(course?.dueDate);
  const assignedTs = epochMs(enr.assignedAt) ?? now;
  const dueTs = firstDefined(enrDue, courseDue, assignedTs + DEFAULT_DUE_DAYS * DAY);
  if (!dueTs) return 'No due date';
  const d = Math.ceil((dueTs - now) / DAY);
  if (d < 0) return 'Overdue';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d} days`;
}

}
