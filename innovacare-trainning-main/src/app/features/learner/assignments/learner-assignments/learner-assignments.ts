import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Firestore, collection, collectionData, doc, docData } from '@angular/fire/firestore';
import { Auth, authState } from '@angular/fire/auth';
import { toSignal } from '@angular/core/rxjs-interop';

import { combineLatest, map, of, switchMap } from 'rxjs';

/* If you don't want an extra lib, use this tiny UID helper instead of uuid: */
function tinyUid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

type SortKey = 'due' | 'az' | 'kind';
type TabKey = 'active' | 'completed';

interface Assignment {
  id: string;                 // courseId
  courseName: string;
  kind: string;               // 'Course' | 'Text' | 'Module'
  durationMin: number;
  status: 'not-started' | 'in-progress' | 'completed';
  dueDate?: string;           // ISO 8601 string (computed)
  completedAt?: string;       // ISO
}

// Firestore shapes (read-only here)
type EnrollmentStatus = 'assigned' | 'started' | 'completed';
interface EnrollmentDoc {
  courseId: string;
  status: EnrollmentStatus;
  assignedAt?: any;   // Timestamp | number | string | undefined
  startedAt?: any;
  completedAt?: any;
  dueDate?: any;      // ISO string | Timestamp | number
}

interface CourseDoc {
  id?: string;
  title?: string;
  kind?: string;
  durationMin?: number;
  dueDate?: string;       // ISO string (optional)
}

/* -------- helpers -------- */
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const t = Date.parse(x);
    return isNaN(t) ? undefined : t;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  return undefined;
}
function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}
function isoOrUndef(ms?: number) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : undefined;
}

@Component({
  selector: 'app-learner-assignments',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './learner-assignments.html',
  styleUrls: ['./learner-assignments.css']
})
export class LearnerAssignments {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  // ----------------- UI state -----------------
  private _tab = signal<TabKey>('active');
  private _sortBy = signal<SortKey>('due');
  private _sortAsc = signal<boolean>(true);
  private _query = signal<string>('');

  tab = this._tab.asReadonly();
  sortBy = this._sortBy.asReadonly();
  sortAsc = this._sortAsc.asReadonly();
  query = this._query.asReadonly();

  setTab(t: TabKey) { this._tab.set(t); }
  

  // ----------------- Data (Firestore → assignments) -----------------
  private assignments$ = authState(this.auth).pipe(
    switchMap(user => {
      if (!user) return of<Assignment[]>([]);
      const enrCol = collection(this.afs, `users/${user.uid}/enrollments`);
      return collectionData(enrCol, { idField: 'id' }).pipe(
        switchMap((enrollments) => {
          const list = (enrollments as EnrollmentDoc[]);
          if (!list.length) return of<Assignment[]>([]);

          const perCourse$ = list.map(enr => {
            const cRef = doc(this.afs, `courses/${enr.courseId}`);
            return docData(cRef, { idField: 'id' }).pipe(
              map((c) => {
                const course = (c || {}) as CourseDoc;

                const uiStatus: Assignment['status'] =
                  enr.status === 'completed' ? 'completed'
                  : enr.status === 'started' ? 'in-progress'
                  : 'not-started';

                // ✅ dueDate priority: enrollment > course > assignedAt + 30d
                const enrDueMs    = epochMs(enr.dueDate);
                const courseDueMs = epochMs(course.dueDate);
                const assignedMs  = epochMs(enr.assignedAt);
                const inferredMs  = assignedMs ? (assignedMs + DEFAULT_DUE_DAYS * DAY) : undefined;
                const dueMs = firstDefined(enrDueMs, courseDueMs, inferredMs);

                const completedMs = epochMs(enr.completedAt);

                return {
                  id: course.id ?? enr.courseId,
                  courseName: course.title ?? '(Untitled course)',
                  kind: course.kind ?? 'Course',
                  durationMin: course.durationMin ?? 0,
                  status: uiStatus,
                  dueDate: isoOrUndef(dueMs),
                  completedAt: isoOrUndef(completedMs),
                } as Assignment;
              })
            );
          });

          return combineLatest(perCourse$);
        })
      );
    })
  );

  private assignmentsSrc = toSignal(this.assignments$, { initialValue: [] as Assignment[] });

  // ----------------- Split: Active vs Completed -----------------
  activeList = computed(() => {
    const items = this.assignmentsSrc().filter(a => a.status !== 'completed');
    return this.applyFilterSort(items, 'active');
  });

  completedList = computed(() => {
    const items = this.assignmentsSrc().filter(a => a.status === 'completed');
    return this.applyFilterSort(items, 'completed');
  });

  // ----------------- View for template -----------------
  view = computed(() => {
    const items = this.assignmentsSrc();
  
    // ✅ IMPORTANT : ne plus afficher les cours complétés dans Assignments
    const onlyActive = items.filter(a => a.status !== 'completed');
  
    const q = this._query().toLowerCase().trim();
    const filtered = onlyActive.filter(a => !q || a.courseName.toLowerCase().includes(q));
  
    const key = this._sortBy();
    const asc = this._sortAsc();
  
    const sorted = [...filtered].sort((a, b) => {
      if (key === 'az') return a.courseName.localeCompare(b.courseName);
      if (key === 'kind') return a.kind.localeCompare(b.kind);
  
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  
    return asc ? sorted : sorted.reverse();
  });
  

  private applyFilterSort(items: Assignment[], tab: TabKey): Assignment[] {
    const q = this._query().toLowerCase().trim();
    const filtered = items.filter(a => !q || a.courseName.toLowerCase().includes(q));

    const key = this._sortBy();
    const asc = this._sortAsc();

    const sorted = [...filtered].sort((a, b) => {
      if (key === 'az') {
        return a.courseName.localeCompare(b.courseName);
      } else if (key === 'kind') {
        return (a.kind || '').localeCompare(b.kind || '');
      } else { // 'due'
        // For completed tab, sort by completed date (most recent first) if available
        if (tab === 'completed') {
          const ca = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const cb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return cb - ca;
        }

        const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      }
    });

    return asc ? sorted : sorted.reverse();
  }

  // ----------------- Handlers -----------------
  setSort(v: string) {
    const mapped = v as SortKey;
    if (mapped === 'due' || mapped === 'az' || mapped === 'kind') {
      this._sortBy.set(mapped);
    }
  }
  toggleSortDirection() { this._sortAsc.set(!this._sortAsc()); }
  onQueryChange(v: string) { this._query.set(v); }

  // ----------------- Helpers for template -----------------
  formatDuration(min: number) { return `${min} min`; }

  isOverdue(a: Assignment) {
    // ✅ overdue applies ONLY for active items
    if (a.status === 'completed') return false;
    return !!(a.dueDate && new Date(a.dueDate).getTime() < Date.now());
  }

  labelDue(a: Assignment) {
    if (a.status === 'completed') {
      if (!a.completedAt) return 'Completed';
      return `Completed ${new Date(a.completedAt).toLocaleDateString()}`;
    }
    if (!a.dueDate) return 'No due date';
    const d = new Date(a.dueDate);
    return this.isOverdue(a) ? `Overdue (${d.toLocaleDateString()})` : `Due ${d.toLocaleDateString()}`;
  }

  // ----------------- Calendar (unchanged) -----------------
  openMenuId = signal<string | null>(null);
  toggleMenu(id: string) { this.openMenuId.set(this.openMenuId() === id ? null : id); }
  closeMenu() { this.openMenuId.set(null); }

  private toIcsDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
  }

  private minutesOrDefault(min?: number): number {
    return min && min > 0 ? min : 60;
  }

  getGoogleCalUrl(a: Assignment): string {
    const title = a.courseName || 'Training';
    const desc = `${a.kind} – assigned course`;
    const start = a.dueDate ? new Date(a.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + this.minutesOrDefault(a.durationMin) * 60 * 1000);

    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      details: desc,
      dates: `${fmt(start)}/${fmt(end)}`,
      ctz: 'America/New_York'
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  downloadIcs(a: Assignment) {
    const title = a.courseName || 'Training';
    const desc = `${a.kind} – assigned course`;
    const start = a.dueDate ? new Date(a.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + this.minutesOrDefault(a.durationMin) * 60 * 1000);

    const dtStamp = this.toIcsDate(new Date());
    const dtStart = this.toIcsDate(start);
    const dtEnd = this.toIcsDate(end);

    const uid = `${a.id}-${tinyUid()}@innovacare`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Innovacare//Learner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${this.escapeIcsText(title)}`,
      `DESCRIPTION:${this.escapeIcsText(desc)}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement('a');
    aEl.href = url;
    aEl.download = `${this.slug(title)}.ics`;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    URL.revokeObjectURL(url);

    this.closeMenu();
  }

  private escapeIcsText(t: string) {
    return (t || '')
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\r?\n/g, '\\n');
  }
  private slug(t: string) {
    return (t || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
