import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  query,
  where,
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, firstValueFrom, from, map, of, switchMap, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { filter } from 'rxjs/operators';
import { PolicyService } from '../../../shared/services/policy';
import { CoursesRepo } from '../../../data/courses.repo';
import type { PolicyAcknowledgement } from '../../learner/policy/model/policy.model';
import {
  CreateManagedUserResult,
  ManagedUserRole,
  ManagedUsersService,
} from '../../../shared/services/managed-users';

interface LearnerDoc {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  orgId?: string | null;
  active?: boolean;
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
  lastSeenAt?: any;
  activityUpdatedAt?: any;
  totalAppSeconds?: number;
}

interface EnrollmentDoc {
  uid?: string;
  courseId: string;
  status: string;
  progress?: number;
  progressPct?: number;
  score?: number;
  orgId?: string | null;
  completedAt?: any;
  dueDate?: any;
  assignedAt?: any;
  startedAt?: any;
  updatedAt?: any;
  gradedAt?: any;
}

interface CourseAnalyticsDoc {
  id?: string;
  durationMin?: number;
}

interface LearnerRow extends LearnerDoc {
  assigned: number;
  inProgress: number;
  completed: number;
  avgScore: number | null;
  averageProgress: number | null;
  estimatedStudyMinutes: number;
  totalAppMinutes: number;
  lastConnectionAt: number | null;
  lastStudyAt: number | null;
  initials: string;
  overdue: number;
  missingPolicies: number;
  riskScore: number;
  riskLabel: 'High' | 'Medium' | 'Low';
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;
const DEFAULT_STARTED_PROGRESS = 25;

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const ts = Date.parse(x);
    return Number.isNaN(ts) ? undefined : ts;
  }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.seconds === 'number') return x.seconds * 1000;
  return undefined;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedStatus(status: string | undefined): string {
  const value = String(status ?? '').toLowerCase();
  if (value === 'in-progress') return 'in_progress';
  if (value === 'not-started') return 'assigned';
  return value;
}

function enrollmentProgress(enrollment: EnrollmentDoc): number | null {
  const explicit = typeof enrollment.progress === 'number'
    ? enrollment.progress
    : typeof enrollment.progressPct === 'number'
      ? enrollment.progressPct
      : null;

  if (explicit !== null && Number.isFinite(explicit)) {
    return clampProgress(explicit);
  }

  const status = normalizedStatus(enrollment.status);
  if (status === 'completed') return 100;
  if (status === 'started' || status === 'in_progress') return DEFAULT_STARTED_PROGRESS;
  if (status === 'assigned') return 0;
  return null;
}

@Component({
  selector: 'app-learners',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './learners.html',
  styleUrl: './learners.css',
})
export class Learners {
  private afs = inject(Firestore);
  private authSvc = inject(AuthService);
  private router = inject(Router);
  private policySvc = inject(PolicyService);
  private managedUsers = inject(ManagedUsersService);
  private coursesRepo = inject(CoursesRepo);
  searchTerm = signal('');
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  sortField = signal<'name' | 'completed' | 'avgScore' | 'risk' | 'progress' | 'studyTime' | 'lastConnection'>('name');
  selectedRiskLearners = signal<Set<string>>(new Set());
  creatingUser = signal(false);
  createUserNotice = signal('');
  createUserError = signal(false);
  createdUser = signal<CreateManagedUserResult | null>(null);
  createUserForm = {
    displayName: '',
    email: '',
    role: 'learner' as Exclude<ManagedUserRole, 'admin'>,
  };

  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  /* ── Learners scoped to org ─────────────────────────────────────── */
  private learners$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as LearnerDoc[]);
      const q = query(
        collection(this.afs, 'users'),
        where('orgId', '==', profile.orgId),
        where('role', '==', 'learner')
      );
      return collectionData(q, { idField: 'id' }).pipe(
        map(list => (list || []) as LearnerDoc[])
      );
    })
  );

  /* ── Enrollments scoped to org ──────────────────────────────────── */
  private enrollments$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of([] as EnrollmentDoc[]);
      const q = query(
        collectionGroup(this.afs, 'enrollments'),
        where('orgId', '==', profile.orgId)
      );
      return collectionData(q, { idField: 'id' }).pipe(
        map(list => (list || []) as EnrollmentDoc[])
      );
    })
  );

  private courses$ = this.profile$.pipe(
    switchMap(profile => this.coursesRepo.visibleForProfile(profile).pipe(
      map(list => (list || []) as CourseAnalyticsDoc[])
    ))
  );

  private requiredPolicies$ = from(this.policySvc.listPolicies({ includeArchived: false })).pipe(
    map(list => list.filter(policy => policy.status === 'active' && policy.requiresAcknowledgement && policy.id))
  );

  private acknowledgements$ = this.requiredPolicies$.pipe(
    switchMap(policies => {
      if (!policies.length) return of([] as PolicyAcknowledgement[]);
      return combineLatest(policies.map(policy => from(this.policySvc.listAcknowledgementsForPolicy(policy.id!)))).pipe(
        map(groups => groups.flat())
      );
    })
  );

  /* ── Join: learner + enrollment stats ───────────────────────────── */
  private rows$ = combineLatest([this.learners$, this.enrollments$, this.requiredPolicies$, this.acknowledgements$, this.courses$]).pipe(
    map(([learners, enrollments, requiredPolicies, acknowledgements, courses]) => {
      const courseMap = new Map<string, CourseAnalyticsDoc>();
      for (const course of courses) {
        if (course.id) courseMap.set(course.id, course);
      }

      const enrByUid = new Map<string, EnrollmentDoc[]>();
      for (const e of enrollments) {
        const uid = e.uid ?? '';
        if (!uid) continue;
        const bucket = enrByUid.get(uid) ?? [];
        bucket.push(e);
        enrByUid.set(uid, bucket);
      }

      const ackPairs = new Set(acknowledgements.map(ack => `${ack.policyId}:${ack.userId}`));
      const now = Date.now();

      return learners.map((l): LearnerRow => {
        const enrs = enrByUid.get(l.id) ?? [];
        const assigned   = enrs.filter(e => normalizedStatus(e.status) === 'assigned').length;
        const inProgress = enrs.filter(e => ['in_progress', 'started'].includes(normalizedStatus(e.status))).length;
        const completed  = enrs.filter(e => normalizedStatus(e.status) === 'completed').length;
        const scored     = enrs.filter(e => normalizedStatus(e.status) === 'completed' && typeof e.score === 'number');
        const avgScore   = scored.length ? Math.round(scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length) : null;
        const overdue = enrs.filter(e => {
          if (normalizedStatus(e.status) === 'completed') return false;
          const assignedAt = epochMs(e.assignedAt);
          const dueTs = epochMs(e.dueDate) ?? (assignedAt ? assignedAt + DEFAULT_DUE_DAYS * DAY : undefined);
          return !!dueTs && dueTs < now;
        }).length;

        let progressTotal = 0;
        let progressCount = 0;
        let estimatedStudyMinutes = 0;
        const studyActivityCandidates: number[] = [];

        for (const enrollment of enrs) {
          const progress = enrollmentProgress(enrollment);
          const courseDuration = Math.max(0, Number(courseMap.get(enrollment.courseId)?.durationMin ?? 0));

          if (progress !== null) {
            progressTotal += progress;
            progressCount += 1;
            estimatedStudyMinutes += Math.round(courseDuration * (progress / 100));
          }

          const activityTimes = [
            epochMs(enrollment.updatedAt),
            epochMs(enrollment.completedAt),
            epochMs(enrollment.gradedAt),
            epochMs(enrollment.startedAt),
            epochMs(enrollment.assignedAt),
          ].filter((value): value is number => value !== undefined);
          studyActivityCandidates.push(...activityTimes);
        }

        const userConnectionCandidates = [
          epochMs(l.lastSeenAt),
          epochMs(l.lastLoginAt),
          epochMs(l.activityUpdatedAt),
          epochMs(l.updatedAt),
          epochMs(l.createdAt),
        ].filter((value): value is number => value !== undefined);

        const averageProgress = progressCount ? Math.round(progressTotal / progressCount) : null;
        const totalAppSeconds = Math.max(0, Number(l.totalAppSeconds ?? 0));
        const totalAppMinutes = totalAppSeconds > 0 ? Math.max(1, Math.ceil(totalAppSeconds / 60)) : 0;
        const lastConnectionAt = userConnectionCandidates.length ? Math.max(...userConnectionCandidates) : null;
        const lastStudyAt = studyActivityCandidates.length ? Math.max(...studyActivityCandidates) : null;
        const missingPolicies = requiredPolicies.filter(policy => !ackPairs.has(`${policy.id}:${l.id}`)).length;
        const riskScore = overdue * 35 + missingPolicies * 25 + (avgScore !== null && avgScore < 70 ? 20 : avgScore !== null && avgScore < 85 ? 8 : 0);
        const riskLabel = riskScore >= 60 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low';

        const name = (l.displayName ?? l.email ?? '').trim();
        const parts = name.split(/\s+/);
        const initials = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase();

        return {
          ...l,
          assigned,
          inProgress,
          completed,
          avgScore,
          averageProgress,
          estimatedStudyMinutes,
          totalAppMinutes,
          lastConnectionAt,
          lastStudyAt,
          initials,
          overdue,
          missingPolicies,
          riskScore,
          riskLabel,
        };
      });
    })
  );

  allRows = toSignal(this.rows$, { initialValue: [] as LearnerRow[] });

  /* ── Filtered + sorted view ─────────────────────────────────────── */
  filteredRows = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const status = this.statusFilter();
    const sort = this.sortField();

    let rows = this.allRows().filter(r => {
      const matchSearch = !term ||
        (r.displayName ?? '').toLowerCase().includes(term) ||
        (r.email ?? '').toLowerCase().includes(term);
      const matchStatus = status === 'all' ||
        (status === 'active' && r.active !== false) ||
        (status === 'inactive' && r.active === false);
      return matchSearch && matchStatus;
    });

    return rows.sort((a, b) => {
      if (sort === 'risk') return b.riskScore - a.riskScore;
      if (sort === 'completed') return b.completed - a.completed;
      if (sort === 'avgScore')  return (b.avgScore ?? -1) - (a.avgScore ?? -1);
      if (sort === 'progress') return (b.averageProgress ?? -1) - (a.averageProgress ?? -1);
      if (sort === 'studyTime') return b.estimatedStudyMinutes - a.estimatedStudyMinutes;
      if (sort === 'lastConnection') return (b.lastConnectionAt ?? 0) - (a.lastConnectionAt ?? 0);
      return (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? '');
    });
  });

  /* ── Aggregate stats for header cards ───────────────────────────── */
  stats = computed(() => {
    const rows = this.allRows();
    const active   = rows.filter(r => r.active !== false).length;
    const inactive = rows.length - active;
    const totalCompleted = rows.reduce((s, r) => s + r.completed, 0);
    const scored = rows.filter(r => r.avgScore !== null);
    const platformAvg = scored.length
      ? Math.round(scored.reduce((s, r) => s + (r.avgScore ?? 0), 0) / scored.length)
      : null;
    const progressRows = rows.filter(r => r.averageProgress !== null);
    const averageProgress = progressRows.length
      ? Math.round(progressRows.reduce((s, r) => s + (r.averageProgress ?? 0), 0) / progressRows.length)
      : null;
    const totalStudyMinutes = rows.reduce((s, r) => s + r.estimatedStudyMinutes, 0);
    const atRisk = rows.filter(r => r.riskScore >= 25).length;
    return { total: rows.length, active, inactive, totalCompleted, platformAvg, averageProgress, totalStudyMinutes, atRisk };
  });

  riskRows = computed(() => this.filteredRows().filter(r => r.riskScore > 0).slice(0, 8));

  selectedRiskCount = computed(() => this.selectedRiskLearners().size);

  toggleRiskLearner(id: string, checked: boolean) {
    const next = new Set(this.selectedRiskLearners());
    if (checked) next.add(id); else next.delete(id);
    this.selectedRiskLearners.set(next);
  }

  toggleAllRiskLearners(checked: boolean) {
    this.selectedRiskLearners.set(checked ? new Set(this.riskRows().map(row => row.id)) : new Set());
  }

  bulkAssignRiskLearners() {
    const ids = Array.from(this.selectedRiskLearners());
    if (!ids.length) return;
    this.router.navigate(['/manager/assign'], { queryParams: { uids: ids.join(',') } });
  }

  bulkSendReminder() {
    this.openBulkNotificationComposer(
      'Training follow-up required',
      'You have overdue or at-risk training items. Please review your assigned courses and complete the next required lesson.',
      '/learner'
    );
  }

  bulkPolicyFollowUp() {
    this.openBulkNotificationComposer(
      'Policy acknowledgement required',
      'One or more required policy acknowledgements are still missing. Please open your policy tasks and complete them as soon as possible.',
      '/learner/policy'
    );
  }

  private openBulkNotificationComposer(title: string, body: string, link: string) {
    const ids = Array.from(this.selectedRiskLearners());
    if (!ids.length) return;

    this.router.navigate(['/manager/notify'], {
      queryParams: {
        uids: ids.join(','),
        title,
        body,
        link,
        severity: 'warning',
      },
    });
  }

  assignTo(learnerId: string) {
    this.router.navigate(['/manager/assign'], { queryParams: { uid: learnerId } });
  }

  async createOrganizationUser() {
    this.createUserNotice.set('');
    this.createUserError.set(false);
    this.createdUser.set(null);

    if (!this.createUserForm.email.trim()) {
      this.createUserNotice.set('Email is required.');
      this.createUserError.set(true);
      return;
    }

    this.creatingUser.set(true);
    try {
      const profile = await firstValueFrom(this.profile$.pipe(take(1)));
      if (!profile.orgId) throw new Error('Your administrator account is not linked to an organization.');

      const result = await this.managedUsers.create({
        displayName: this.createUserForm.displayName.trim(),
        email: this.createUserForm.email.trim(),
        role: this.createUserForm.role,
        orgId: profile.orgId,
      });

      this.createdUser.set(result);
      this.createUserNotice.set('User created in your organization.');
      this.createUserForm.displayName = '';
      this.createUserForm.email = '';
      this.createUserForm.role = 'learner';
    } catch (e: any) {
      this.createUserNotice.set(e?.message || 'Failed to create user.');
      this.createUserError.set(true);
    } finally {
      this.creatingUser.set(false);
    }
  }

  formatLastSeen(value: number | null): string {
    if (!value) return 'No activity';

    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  formatStudyTime(minutes: number): string {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) return `${mins}m`;
    if (!mins) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }

  clearSearch() { this.searchTerm.set(''); }
}
