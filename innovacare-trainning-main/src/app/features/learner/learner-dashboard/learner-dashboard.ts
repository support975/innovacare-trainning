import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

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

@Component({
  standalone: true,
  selector: 'app-learner-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './learner-dashboard.html',
  styleUrls: ['./learner-dashboard.css'],
})
export class LearnerDashboardComponent {
  private auth = inject(Auth);
  private afs = inject(Firestore);

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

        const durationMin = course.durationMin ?? 0;
        const hrs = Math.floor(durationMin / 60);
        const mins = durationMin % 60;
        const duration = hrs > 0 ? `${hrs}h ${mins}min` : `${mins}min`;

        items.push({
          title: course.title ?? '(Untitled course)',
          type: course.kind ?? 'Course',
          duration,
          date: new Date(ts).toLocaleDateString(),
          link: `/learner/courses/${course.id ?? ''}`,
          ts
        });
      }

      return items.sort((a, b) => b.ts - a.ts).slice(0, 5);
    })
  );
  recent = toSignal(this.recent$, { initialValue: [] as RecentItem[] });

  // ---------------- Static links/resources ----------------
  links = [
    { label: 'Home', path: '/learner', active: true },
    { label: 'Assignments', path: '/learner/assignments' },
    { label: 'Licenses & Certifications', path: '/learner/certifications' },
    { label: 'Course Library', path: '/learner/library' },
    { label: 'Transcript', path: '/learner/transcript' },
    { label: 'Rewards', path: '/learner/rewards' },
  ];

  resources = [
    { label: 'Policies & Procedures', path: '/resources/policies' },
  ];

  // learner-dashboard.ts (ajoute ces deux blocs à la fin de ta classe)
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
