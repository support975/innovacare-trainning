import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';

type EnrollmentStatus = 'assigned' | 'started' | 'completed';

interface EnrollmentDoc {
  courseId: string;
  status: EnrollmentStatus;
  score?: number;
  completedAt?: any;
  dueDate?: any;
}

interface CourseDoc {
  id?: string;
  title?: string;
  durationMin?: number;
  ceCredit?: number;
  kind?: string;
  boardName?: string; // optional metadata
  type?: string;      // optional metadata
  plan?: string;      // optional metadata
}

type TranscriptRow = {
  courseId: string;
  title: string;
  hours: string;
  hoursNum: number;           // for filtering/sorting if you want
  grade: string;
  completedDate: string;
  dueDate: string;
  status: EnrollmentStatus;
  scoreNum?: number;

  // ✅ for filters
  boardName: string;
  type: string;
  plan: string;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const t = Date.parse(x);
    return isNaN(t) ? undefined : t;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.toDate === 'function') return +x.toDate();
  return undefined;
}

function fmtShortDate(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString(); } catch { return '—'; }
}

function minsToHours(mins?: number): number {
  const m = Math.max(0, Number(mins ?? 0));
  const hrs = m / 60;
  return Math.round(hrs * 100) / 100; // 2 decimals
}

function minsToHoursLabel(mins?: number): string {
  const hrs = minsToHours(mins);
  if (hrs === 1) return '1 hour';
  return `${hrs} hours`;
}

@Component({
  selector: 'app-transcript',
  imports: [CommonModule, RouterModule],
  templateUrl: './transcript.html',
  styleUrl: './transcript.css',
  standalone: true
})
export class Transcript {
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private router = inject(Router);

  // UI
  filtersOpen = signal(true);
  search = signal('');

  // Columns
  columnsOpen = signal(false);
  colTitle = signal(true);
  colHours = signal(true);
  colGrade = signal(true);
  colCompleted = signal(true);
  colDue = signal(false);
  colAction = signal(true);

  // Date filters
  fCompletedFrom = signal<string>('');
  fCompletedTo = signal<string>('');
  fDueFrom = signal<string>('');
  fDueTo = signal<string>('');

  // ✅ Missing fields fixed here (these are what your template references)
  fBoard = signal<string>('');  // boardName contains this
  fType  = signal<string>('');  // type contains this
  fPlan  = signal<string>('');  // plan contains this

  // Accordion state
  accCompleted = signal(true);
  accDue = signal(false);
  accBoard = signal(false);
  accType = signal(false);
  accPlan = signal(false);

  private user$ = authState(this.auth);

  private enrollments$ = this.user$.pipe(
    switchMap(u => {
      if (!u) return of([] as EnrollmentDoc[]);
      const ref = collection(this.afs, `users/${u.uid}/enrollments`);
      return collectionData(ref, { idField: 'id' }).pipe(
        map((rows: any[]) => (rows || []).map(r => ({
          courseId: String(r.courseId ?? r.id ?? ''),
          status: (r.status ?? 'assigned') as EnrollmentStatus,
          score: typeof r.score === 'number' ? r.score : undefined,
          completedAt: r.completedAt,
          dueDate: r.dueDate,
        } as EnrollmentDoc)))
      );
    })
  );

  private rows$ = this.enrollments$.pipe(
    switchMap(enrs => {
      const completed = (enrs || []).filter(e => e.status === 'completed' && e.courseId);
      if (!completed.length) return of([] as TranscriptRow[]);

      const courseObs = completed.map(e =>
        docData(doc(this.afs, `courses/${e.courseId}`), { idField: 'id' })
      );

      return combineLatest(courseObs).pipe(
        map((coursesRaw) => {
          const courseMap = new Map<string, CourseDoc>();
          (coursesRaw as any[]).forEach(c => { if (c?.id) courseMap.set(String(c.id), c as CourseDoc); });

          const out: TranscriptRow[] = completed.map(e => {
            const c = courseMap.get(e.courseId) ?? {};
            const completedMs = epochMs(e.completedAt);
            const dueMs = epochMs(e.dueDate);

            const scoreNum = typeof e.score === 'number' ? e.score : undefined;
            const grade = scoreNum === undefined ? '—' : `${Math.round(scoreNum)}%`;

            const hoursNum = minsToHours(c.durationMin ?? 60);

            return {
              courseId: e.courseId,
              title: String(c.title ?? e.courseId),
              hours: minsToHoursLabel(c.durationMin ?? 60),
              hoursNum,
              grade,
              completedDate: fmtShortDate(completedMs),
              dueDate: fmtShortDate(dueMs),
              status: e.status,
              scoreNum,

              boardName: String(c.boardName ?? '—'),
              type: String(c.type ?? '—'),
              plan: String(c.plan ?? '—'),
            };
          });

          // sort by completed date desc (best effort)
          return out.sort((a, b) => Date.parse(b.completedDate) - Date.parse(a.completedDate));
        })
      );
    })
  );

  rowsSrc = toSignal(this.rows$, { initialValue: [] as TranscriptRow[] });

  view = computed(() => {
    const q = this.search().trim().toLowerCase();
    let rows = this.rowsSrc();

    // Search
    if (q) {
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.grade || '').toLowerCase().includes(q) ||
        (r.boardName || '').toLowerCase().includes(q) ||
        (r.type || '').toLowerCase().includes(q) ||
        (r.plan || '').toLowerCase().includes(q)
      );
    }

    // Completed range
    const cFrom = this.fCompletedFrom() ? Date.parse(this.fCompletedFrom()) : undefined;
    const cTo = this.fCompletedTo() ? Date.parse(this.fCompletedTo()) : undefined;
    if (cFrom || cTo) {
      rows = rows.filter(r => {
        const ms = Date.parse(r.completedDate);
        if (!isNaN(ms)) {
          if (cFrom && ms < cFrom) return false;
          if (cTo && ms > (cTo + (24 * HOUR) - 1)) return false;
        }
        return true;
      });
    }

    // Due range (optional)
    const dFrom = this.fDueFrom() ? Date.parse(this.fDueFrom()) : undefined;
    const dTo = this.fDueTo() ? Date.parse(this.fDueTo()) : undefined;
    if (dFrom || dTo) {
      rows = rows.filter(r => {
        const ms = Date.parse(r.dueDate);
        if (!isNaN(ms)) {
          if (dFrom && ms < dFrom) return false;
          if (dTo && ms > (dTo + (24 * HOUR) - 1)) return false;
        }
        return true;
      });
    }

    // ✅ Board/Type/Plan filters
    const b = this.fBoard().trim().toLowerCase();
    if (b) rows = rows.filter(r => (r.boardName || '').toLowerCase().includes(b));

    const t = this.fType().trim().toLowerCase();
    if (t) rows = rows.filter(r => (r.type || '').toLowerCase().includes(t));

    const p = this.fPlan().trim().toLowerCase();
    if (p) rows = rows.filter(r => (r.plan || '').toLowerCase().includes(p));

    return rows;
  });

  displayedCount = computed(() => this.view().length);
  totalCount = computed(() => this.rowsSrc().length);
  courseId: any;

  toggleFilters() { this.filtersOpen.set(!this.filtersOpen()); }
  toggleColumns() { this.columnsOpen.set(!this.columnsOpen()); }

  resetFilters() {
    this.search.set('');
    this.fCompletedFrom.set('');
    this.fCompletedTo.set('');
    this.fDueFrom.set('');
    this.fDueTo.set('');
    this.fBoard.set('');
    this.fType.set('');
    this.fPlan.set('');
  }

  // ✅ Certificate route (your learnerRoutes: /learner/certifications?courseId=...)
  getCertificate(row: TranscriptRow) {
    this.router.navigate(['/learner/certifications'], {
      queryParams: { courseId: row.courseId }
    });
  }
  getCourse(row: TranscriptRow){
    this.router.navigate(['/learner/courses', this.courseId=row.courseId],{
      queryParams: { courseId: row.courseId }
    });
  }
}
