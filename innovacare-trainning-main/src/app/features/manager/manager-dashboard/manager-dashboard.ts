import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  doc,
  docData,
} from '@angular/fire/firestore';

import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

/* ----------------- Types ----------------- */
type KPI = { completion30: string; overdue: number; avgScore: string };

type AssignmentRow = {
  id: string; // courseId
  course: string;
  audience: string;
  due: string;
  status: 'Active' | 'Closed';
  dueTs?: number; // for sorting
};

type ResultRow = {
  uid: string;
  userName: string;
  userEmail: string;
  courseId: string;
  course: string;
  score: number;
  completedTs: number;
  date: string;
};

type EnrollmentStatus = 'assigned' | 'started' | 'completed';

interface EnrollmentDoc {
  // recommended: store uid on write, but we can infer from doc ref idField (not available here)
  courseId: string;
  status: EnrollmentStatus;

  uid?: string; // if you store it (recommended)

  score?: number;

  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;

  dueDate?: any;
}

interface CourseDoc {
  id?: string;
  title?: string;
  kind?: 'Course' | 'Text' | 'Module';
  durationMin?: number;
  dueDate?: any; // Timestamp|string|number
}

interface UserDoc {
  id: string; // uid
  displayName?: string;
  email?: string;
  role?: string;
}

/* ----------------- Helpers ----------------- */
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;
const nowMs = () => Date.now();

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const t = Date.parse(x);
    return isNaN(t) ? undefined : t;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.seconds === 'number') return x.seconds * 1000; // some Timestamp shapes
  return undefined;
}

function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function fmtDateShort(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function safeStr(x: any) {
  return (x ?? '').toString();
}

@Component({
  standalone: true,
  selector: 'app-manager-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './manager-dashboard.html',
  styleUrls: ['./manager-dashboard.css'],
})
export class ManagerDashboardComponent {
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);

  /* ----------- Feature flags for missing pages ----------- */
  // Set to true when you create those components/routes.
  hasReportsPage = false;
  hasResultDetailsPage = false;
  hasAssignmentDetailsPage = false;

  notice = '';

  /* ----------- Manager name ----------- */
  private auth$ = authState(this.auth);

  private managerName$ = this.auth$.pipe(
    switchMap(user => {
      if (!user) return of('Manager');
      const fromAuth = user.displayName?.trim();
      if (fromAuth) return of(fromAuth);
      return docData(doc(this.afs, `users/${user.uid}`)).pipe(
        map((u: any) => safeStr(u?.displayName) || 'Manager')
      );
    })
  );
  managerName = toSignal(this.managerName$, { initialValue: 'Manager' });

  /* ----------- Load enrollments (all users) ----------- */
  // IMPORTANT: This will scan all subcollections named "enrollments".
  // Ensure your Security Rules allow manager access.
  private enrollments$ = collectionGroup(this.afs, 'enrollments');

  // NOTE: collectionGroup + collectionData does not include parent path by default.
  // Best practice: store uid on enrollment write.
  private enr$ = collectionData(this.enrollments$, { idField: 'id' }).pipe(
    map(list => (list || []) as any[]),
    map(list => list.map(e => e as EnrollmentDoc))
  );

  /* ----------- Courses join ----------- */
  private rows$ = this.enr$.pipe(
    switchMap((enrs) => {
      if (!enrs.length) return of([] as Array<{ enr: EnrollmentDoc; course?: CourseDoc }>);
      const courseIds = Array.from(new Set(enrs.map(e => e.courseId).filter(Boolean)));
      const courseObs = courseIds.map(cid => docData(doc(this.afs, `courses/${cid}`), { idField: 'id' }));
      return (courseObs.length ? combineLatest(courseObs) : of([])).pipe(
        map((coursesRaw) => {
          const courseMap = new Map<string, CourseDoc>();
          (coursesRaw as CourseDoc[]).forEach(c => { if (c?.id) courseMap.set(c.id, c); });
          return enrs.map(enr => ({ enr, course: courseMap.get(enr.courseId) }));
        })
      );
    })
  );

  /* ----------- User directory (uid → displayName/email) ----------- */
  private users$ = collectionData(collection(this.afs, 'users'), { idField: 'id' }).pipe(
    map(list => (list || []) as UserDoc[]),
    map(list => {
      const m = new Map<string, UserDoc>();
      list.forEach(u => m.set(u.id, u));
      return m;
    })
  );

  /* ----------- KPI (survey-ready definitions) ----------- */
  private kpi$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows]) => {
      const now = nowMs();
      const from30 = now - 30 * DAY;

      let completedLast30 = 0;
      let assignedOrStartedLast30 = 0;

      let overdue = 0;

      // Average Score should reflect actual completions
      let sumScore = 0;
      let countScore = 0;

      for (const { enr, course } of rows) {
        const assigned = epochMs(enr.assignedAt);
        const started = epochMs(enr.startedAt);
        const completed = epochMs(enr.completedAt);

        const enrDue = epochMs(enr.dueDate);
        const courseDue = epochMs(course?.dueDate);
        const inferred = assigned ? (assigned + DEFAULT_DUE_DAYS * DAY) : undefined;
        const dueTs = firstDefined(enrDue, courseDue, inferred);

        // overdue: not completed + due in past
        if (enr.status !== 'completed' && dueTs && dueTs < now) overdue++;

        // completion KPI window: last 30 days
        if ((assigned && assigned >= from30) || (started && started >= from30)) {
          assignedOrStartedLast30++;
        }

        if (enr.status === 'completed' && completed && completed >= from30) {
          completedLast30++;
        }

        // avg score across completed (no window restriction unless you want last 30d)
        if (enr.status === 'completed' && typeof enr.score === 'number') {
          sumScore += enr.score;
          countScore++;
        }
      }

      const completionPct = assignedOrStartedLast30 > 0
        ? Math.round((completedLast30 / assignedOrStartedLast30) * 100)
        : 0;

      const avgScorePct = countScore > 0 ? Math.round(sumScore / countScore) : 0;

      return {
        completion30: `${completionPct}%`,
        overdue,
        avgScore: String(avgScorePct),
      } satisfies KPI;
    })
  );

  kpi = toSignal(this.kpi$, {
    initialValue: { completion30: '0%', overdue: 0, avgScore: '0' },
  });

  /* ----------- Open Assignments (group by course) ----------- */
  private openAssignments$ = this.rows$.pipe(
    map(rows => {
      const byCourse = new Map<string, { course: CourseDoc; enrs: EnrollmentDoc[] }>();

      for (const { enr, course } of rows) {
        if (enr.status === 'completed') continue;
        const key = enr.courseId;
        const bucket = byCourse.get(key) ?? { course: (course || { id: enr.courseId }), enrs: [] };
        bucket.enrs.push(enr);
        byCourse.set(key, bucket);
      }

      const now = nowMs();
      const out: AssignmentRow[] = [];

      for (const [courseId, { course, enrs }] of byCourse) {
        let nextDue: number | undefined = undefined;

        for (const enr of enrs) {
          const assigned = epochMs(enr.assignedAt);
          const due = firstDefined(
            epochMs(enr.dueDate),
            epochMs(course?.dueDate),
            assigned ? (assigned + DEFAULT_DUE_DAYS * DAY) : undefined
          );
          if (due && (nextDue === undefined || due < nextDue)) nextDue = due;
        }

        const audience = `${enrs.length} learner${enrs.length > 1 ? 's' : ''}`;

        // active if any still not completed
        const status: 'Active' | 'Closed' = enrs.length ? 'Active' : 'Closed';

        out.push({
          id: courseId,
          course: course?.title || courseId,
          audience,
          due: nextDue ? fmtDateShort(nextDue) : '—',
          status,
          dueTs: nextDue ?? (now + 3650 * DAY),
        });
      }

      return out
        .sort((a, b) => (a.dueTs ?? 0) - (b.dueTs ?? 0))
        .slice(0, 10);
    })
  );

  openAssignments = toSignal(this.openAssignments$, {
    initialValue: [] as AssignmentRow[],
  });

  /* ----------- Recent Results (top 10) ----------- */
  private recentResults$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows, users]) => {
      const items: ResultRow[] = [];

      for (const { enr, course } of rows) {
        if (enr.status !== 'completed') continue;

        const completedTs = epochMs(enr.completedAt);
        if (!completedTs) continue;

        // Prefer enr.uid if stored; otherwise we cannot reliably identify user from collectionGroup result
        const uid = safeStr(enr.uid);

        const userDoc = uid ? users.get(uid) : undefined;
        const userName = safeStr(userDoc?.displayName) || (uid ? uid : '(unknown)');
        const userEmail = safeStr(userDoc?.email);

        items.push({
          uid: uid || '(unknown)',
          userName,
          userEmail,
          courseId: enr.courseId,
          course: course?.title || enr.courseId,
          score: typeof enr.score === 'number' ? enr.score : 0,
          completedTs,
          date: fmtDateShort(completedTs),
        });
      }

      return items
        .sort((a, b) => b.completedTs - a.completedTs)
        .slice(0, 10);
    })
  );

  recentResults = toSignal(this.recentResults$, {
    initialValue: [] as ResultRow[],
  });

  /* ----------- Overdue notifications panel (UI only) ----------- */
  private overdueAlerts$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows, users]) => {
      const now = nowMs();
      const alerts: Array<{ uid: string; user: string; email: string; course: string; due: string; dueTs: number }> = [];

      for (const { enr, course } of rows) {
        if (enr.status === 'completed') continue;

        const assigned = epochMs(enr.assignedAt);
        const dueTs = firstDefined(
          epochMs(enr.dueDate),
          epochMs(course?.dueDate),
          assigned ? (assigned + DEFAULT_DUE_DAYS * DAY) : undefined
        );

        if (!dueTs || dueTs >= now) continue;

        const uid = safeStr(enr.uid);
        const u = uid ? users.get(uid) : undefined;

        alerts.push({
          uid: uid || '(unknown)',
          user: safeStr(u?.displayName) || (uid || '(unknown)'),
          email: safeStr(u?.email),
          course: safeStr(course?.title) || enr.courseId,
          due: fmtDateShort(dueTs),
          dueTs,
        });
      }

      return alerts.sort((a, b) => a.dueTs - b.dueTs).slice(0, 8);
    })
  );

  overdueAlerts = toSignal(this.overdueAlerts$, { initialValue: [] as any[] });

  /* ----------- Buttons / Navigation ----------- */
  onAddCourse() { this.router.navigate(['manager/courses']); }
  onAssignTraining() { this.router.navigate(['/manager/assign']); }
  onExportCSV() { this.notice = 'Export CSV not implemented yet.'; }

  onCreatePolicy() { this.router.navigate(['/manager/policy/new']); }
  onCreateCourse() { this.router.navigate(['/manager/courses']); }
  onCreateLearner() { this.notice = 'Learner management not implemented yet.'; }
  onCreateWounds() { this.router.navigate(['/manager/wounds']); }
  onCreateAssign() { this.router.navigate(['/manager/assign']); }
  onCreateNotification() { this.router.navigate(['/manager/notify']); }

  onCreateReport() {
    if (!this.hasReportsPage) {
      this.notice = 'Reports page is not implemented yet.';
      return;
    }
    this.router.navigate(['/manager/reports']);
  }

  onPolicyReport() { this.router.navigate(['/manager/policy-report']); }

  openAssignment(courseId: string) {
    if (!this.hasAssignmentDetailsPage) {
      this.notice = 'Assignment details page is not implemented yet.';
      return;
    }
    this.router.navigate(['/manager/assign', courseId]);
  }

  openResultDetails(uid: string) {
    if (!this.hasResultDetailsPage) {
      this.notice = 'Result details page is not implemented yet.';
      return;
    }
    this.router.navigate(['/manager/results', uid]);
  }

  clearNotice() { this.notice = ''; }
}
