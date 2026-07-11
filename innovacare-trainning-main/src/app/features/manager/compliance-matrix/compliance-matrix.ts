import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Firestore, collection, collectionData, collectionGroup, query, where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AppProfile, AuthService } from '../../../core/auth';
import { CoursesRepo } from '../../../data/courses.repo';
import type { Course } from '../../../data/models';
import { LearningPath, LearningPathsService } from '../../../shared/services/learning-paths';

type MatrixStatus = 'completed' | 'started' | 'assigned' | 'overdue' | 'missing';
type MatrixFilter = 'all' | MatrixStatus | 'noncompliant';

interface LearnerDoc {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  orgId?: string | null;
}

interface EnrollmentDoc {
  id?: string;
  uid?: string;
  courseId: string;
  status?: string;
  score?: number;
  orgId?: string | null;
  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;
  dueDate?: any;
}

interface Requirement {
  courseId: string;
  title: string;
  kind: string;
  durationMin: number;
  pathTitles: string[];
  dueDate?: any;
}

type MatrixCourse = Course & {
  dueDate?: any;
};

interface MatrixCell {
  learnerId: string;
  courseId: string;
  status: MatrixStatus;
  label: string;
  dueLabel: string;
  scoreLabel: string;
  dueTs?: number;
}

interface MatrixRow {
  learnerId: string;
  learnerName: string;
  email: string;
  cells: MatrixCell[];
  completed: number;
  started: number;
  overdue: number;
  missing: number;
  compliancePct: number;
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;

function epochMs(value: any): number | undefined {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return undefined;
}

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

function dueLabel(dueTs?: number): string {
  if (!dueTs) return 'No due date';
  const days = Math.ceil((dueTs - Date.now()) / DAY);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

@Component({
  selector: 'app-compliance-matrix',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './compliance-matrix.html',
  styleUrl: './compliance-matrix.css',
})
export class ComplianceMatrixComponent {
  private readonly afs = inject(Firestore);
  private readonly authSvc = inject(AuthService);
  private readonly coursesRepo = inject(CoursesRepo);
  private readonly learningPaths = inject(LearningPathsService);

  readonly search = signal('');
  readonly statusFilter = signal<MatrixFilter>('all');

  private readonly profile$ = this.authSvc.profile$.pipe(
    filter((profile): profile is AppProfile => !!profile)
  );

  private readonly learners$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as LearnerDoc[]);
      const q = query(
        collection(this.afs, 'users'),
        where('orgId', '==', profile.orgId),
        where('role', '==', 'learner')
      );
      return collectionData(q, { idField: 'id' }).pipe(map(list => (list || []) as LearnerDoc[]));
    })
  );

  private readonly enrollments$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as EnrollmentDoc[]);
      const q = query(collectionGroup(this.afs, 'enrollments'), where('orgId', '==', profile.orgId));
      return collectionData(q, { idField: 'id' }).pipe(map(list => (list || []) as EnrollmentDoc[]));
    })
  );

  private readonly courses$ = this.profile$.pipe(
    switchMap(profile => this.coursesRepo.visibleForProfile(profile)),
    map(courses => (courses || []).filter(course => course.active !== false))
  );

  private readonly paths$ = this.profile$.pipe(
    switchMap(profile => this.learningPaths.visibleForProfile(profile))
  );

  readonly requirements = toSignal(
    combineLatest([this.courses$, this.paths$]).pipe(
      map(([courses, paths]) => this.buildRequirements(courses, paths))
    ),
    { initialValue: [] as Requirement[] }
  );

  private readonly rows$ = combineLatest([
    this.learners$,
    this.enrollments$,
    this.courses$,
    this.paths$,
  ]).pipe(
    map(([learners, enrollments, courses, paths]) => {
      const requirements = this.buildRequirements(courses, paths);
      const enrollmentMap = new Map<string, EnrollmentDoc>();
      enrollments.forEach(enrollment => {
        if (!enrollment.uid || !enrollment.courseId) return;
        enrollmentMap.set(`${enrollment.uid}:${enrollment.courseId}`, enrollment);
      });

      return learners
        .map(learner => this.buildLearnerRow(learner, requirements, enrollmentMap))
        .sort((a, b) => {
          if (a.compliancePct !== b.compliancePct) return a.compliancePct - b.compliancePct;
          return a.learnerName.localeCompare(b.learnerName);
        });
    })
  );

  readonly rows = toSignal(this.rows$, { initialValue: [] as MatrixRow[] });

  readonly filteredRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filterValue = this.statusFilter();
    return this.rows().filter(row => {
      const matchesSearch = !term || `${row.learnerName} ${row.email}`.toLowerCase().includes(term);
      const matchesStatus =
        filterValue === 'all'
          ? true
          : filterValue === 'noncompliant'
            ? row.missing > 0 || row.overdue > 0
            : row.cells.some(cell => cell.status === filterValue);
      return matchesSearch && matchesStatus;
    });
  });

  readonly summary = computed(() => {
    const rows = this.rows();
    const requirements = this.requirements();
    const totalCells = rows.length * requirements.length;
    const completed = rows.reduce((sum, row) => sum + row.completed, 0);
    const overdue = rows.reduce((sum, row) => sum + row.overdue, 0);
    const missing = rows.reduce((sum, row) => sum + row.missing, 0);
    return {
      learners: rows.length,
      requirements: requirements.length,
      completed,
      overdue,
      missing,
      compliancePct: totalCells ? Math.round((completed / totalCells) * 100) : 0,
    };
  });

  exportCsv(): void {
    const requirements = this.requirements();
    const header = [
      'learner',
      'email',
      'compliancePct',
      'completed',
      'overdue',
      'missing',
      ...requirements.map(req => req.title),
    ];
    const rows = this.filteredRows().map(row => [
      row.learnerName,
      row.email,
      `${row.compliancePct}%`,
      String(row.completed),
      String(row.overdue),
      String(row.missing),
      ...requirements.map(req => row.cells.find(cell => cell.courseId === req.courseId)?.label ?? 'Missing'),
    ]);

    const csv = [header, ...rows]
      .map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `compliance-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  trackCourse(_: number, requirement: Requirement): string {
    return requirement.courseId;
  }

  trackRow(_: number, row: MatrixRow): string {
    return row.learnerId;
  }

  private buildRequirements(courses: Course[], paths: LearningPath[]): Requirement[] {
    const pathMap = new Map<string, string[]>();
    paths.forEach(path => {
      (path.courseIds || []).forEach(courseId => {
        const list = pathMap.get(courseId) ?? [];
        list.push(path.title);
        pathMap.set(courseId, list);
      });
    });

    return courses
      .filter((course): course is MatrixCourse & { id: string } => !!course.id)
      .map(course => ({
        courseId: course.id,
        title: course.title || course.id,
        kind: course.kind || 'Course',
        durationMin: course.durationMin || 0,
        pathTitles: pathMap.get(course.id) ?? [],
        dueDate: course.dueDate,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  private buildLearnerRow(
    learner: LearnerDoc,
    requirements: Requirement[],
    enrollmentMap: Map<string, EnrollmentDoc>
  ): MatrixRow {
    const cells = requirements.map(requirement => {
      const enrollment = enrollmentMap.get(`${learner.id}:${requirement.courseId}`);
      return this.buildCell(learner.id, requirement, enrollment);
    });
    const completed = cells.filter(cell => cell.status === 'completed').length;
    const started = cells.filter(cell => cell.status === 'started' || cell.status === 'assigned').length;
    const overdue = cells.filter(cell => cell.status === 'overdue').length;
    const missing = cells.filter(cell => cell.status === 'missing').length;
    const compliancePct = requirements.length ? Math.round((completed / requirements.length) * 100) : 0;

    return {
      learnerId: learner.id,
      learnerName: learner.displayName || learner.email || learner.id,
      email: learner.email || '',
      cells,
      completed,
      started,
      overdue,
      missing,
      compliancePct,
    };
  }

  private buildCell(learnerId: string, requirement: Requirement, enrollment?: EnrollmentDoc): MatrixCell {
    if (!enrollment) {
      return {
        learnerId,
        courseId: requirement.courseId,
        status: 'missing',
        label: 'Missing',
        dueLabel: 'Not assigned',
        scoreLabel: '',
      };
    }

    const assignedTs = epochMs(enrollment.assignedAt);
    const dueTs = firstDefined(
      epochMs(enrollment.dueDate),
      epochMs(requirement.dueDate),
      assignedTs ? assignedTs + DEFAULT_DUE_DAYS * DAY : undefined
    );
    const rawStatus = String(enrollment.status || 'assigned').toLowerCase();
    const isOverdue = rawStatus !== 'completed' && !!dueTs && dueTs < Date.now();
    const status: MatrixStatus = isOverdue
      ? 'overdue'
      : rawStatus === 'completed'
        ? 'completed'
        : rawStatus === 'started'
          ? 'started'
          : 'assigned';

    return {
      learnerId,
      courseId: requirement.courseId,
      status,
      label: status === 'overdue' ? 'Overdue' : status[0].toUpperCase() + status.slice(1),
      dueLabel: dueLabel(dueTs),
      scoreLabel: typeof enrollment.score === 'number' ? `${Math.round(enrollment.score)}%` : '',
      dueTs,
    };
  }
}
