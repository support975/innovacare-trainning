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
  query,
  where,
} from '@angular/fire/firestore';

import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap, filter } from 'rxjs';
import type { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CandidateApplication } from '../../../shared/certification-authority/certification.models';

/* ----------------- Types ----------------- */
type KPI = { completion30: string; overdue: number; avgScore: string };
type Readiness = {
  learnerCount: number;
  activeAssignments: number;
  inProgress: number;
  completed: number;
  uniqueCourses: number;
};

type AssignmentRow = {
  id: string;
  course: string;
  audience: string;
  due: string;
  status: 'Active' | 'Closed';
  dueTs?: number;
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

type ManagerActionCard = {
  label: string;
  value: number;
  detail: string;
  tone: 'warn' | 'teal' | 'navy';
  route: string;
  cta: string;
};

type EnrollmentStatus = 'assigned' | 'started' | 'completed';

interface EnrollmentDoc {
  courseId: string;
  status: EnrollmentStatus;
  uid?: string;
  orgId?: string | null;
  score?: number;
  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;
  dueDate?: any;
}

interface CourseDoc {
  id?: string;
  title?: string;
  kind?: string;
  durationMin?: number;
  dueDate?: any;
}

interface UserDoc {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  orgId?: string | null;
  lastSeenAt?: any;
  lastLoginAt?: any;
  activityUpdatedAt?: any;
  totalAppMinutes?: number;
}

interface AccessRequestDoc {
  id: string;
  uid?: string;
  userEmail?: string;
  userName?: string;
  courseId?: string;
  courseTitle?: string;
  status?: string;
  paymentStatus?: string;
  updatedAt?: any;
}

interface OrganizationDoc {
  name?: string;
  certificationAuthorityEnabled?: boolean;
  features?: { officialCertifications?: boolean };
}

type CertificationKpis = {
  totalCandidates: number;
  pendingReview: number;
  examCompleted: number;
  passed: number;
  rejected: number;
  activeMemberships: number;
  expiringSoon: number;
  expired: number;
};

/* ----------------- Helpers ----------------- */
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_DAYS = 30;
const nowMs = () => Date.now();

function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') { const t = Date.parse(x); return isNaN(t) ? undefined : t; }
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.seconds === 'number') return x.seconds * 1000;
  return undefined;
}

function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function fmtDateShort(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function safeStr(x: any) { return (x ?? '').toString(); }

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
  private authSvc = inject(AuthService);
  private certApplicationsSvc = inject(CandidateApplicationService);

  notice = '';

  /* ── Manager profile (includes orgId) ─────────────────────────── */
  private profile$ = this.authSvc.profile$.pipe(filter(Boolean));

  /* ── Manager name ──────────────────────────────────────────────── */
  private managerName$ = authState(this.auth).pipe(
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

  /* ── Org context (name shown in header) ─────────────────────────── */
  orgId = toSignal(this.profile$.pipe(map(p => p.orgId ?? null)), { initialValue: null as string | null });
  private orgDoc$ = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of(undefined as OrganizationDoc | undefined);
      return docData(doc(this.afs, `organizations/${profile.orgId}`)).pipe(
        map((org) => org as OrganizationDoc | undefined)
      );
    })
  );
  orgName = toSignal(
    this.orgDoc$.pipe(map((org) => safeStr(org?.name).trim() || this.orgId() || 'your organization')),
    { initialValue: 'your organization' }
  );

  certificationAuthorityEnabled = toSignal(
    combineLatest([this.profile$, this.orgDoc$]).pipe(
      map(([profile, org]) => {
        const hasPermission = (profile?.permissions || []).some((p) => p.startsWith('certification.'));
        return hasPermission
          || org?.certificationAuthorityEnabled === true
          || org?.features?.officialCertifications === true;
      })
    ),
    { initialValue: false }
  );

  /* ── Certification KPIs ─────────────────────────────────────────── */
  private certApplications$ = this.certApplicationsSvc.listForCurrentOrganization().pipe(
    catchError((error) => {
      console.warn('Unable to load candidate applications for KPI cards.', error);
      return of([] as CandidateApplication[]);
    })
  );

  private certKpis$ = this.certApplications$.pipe(
    map((apps) => {
      const now = Date.now();
      const soon = now + 30 * DAY;
      let activeMemberships = 0;
      let expiringSoon = 0;
      let expired = 0;

      for (const app of apps) {
        const expiresAt = epochMs((app as any).membershipCard?.expiresAt);
        if (!expiresAt) continue;
        if (expiresAt < now) expired++;
        else if (expiresAt <= soon) expiringSoon++;
        else activeMemberships++;
      }

      return {
        totalCandidates: apps.length,
        pendingReview: apps.filter((a) => ['submitted', 'under_review', 'missing_documents'].includes(a.status)).length,
        examCompleted: apps.filter((a) => a.status === 'exam_completed' || a.status === 'jury_review').length,
        passed: apps.filter((a) => a.status === 'passed').length,
        rejected: apps.filter((a) => a.status === 'rejected' || a.status === 'failed').length,
        activeMemberships,
        expiringSoon,
        expired,
      } satisfies CertificationKpis;
    })
  );

  certKpis = toSignal(this.certKpis$, {
    initialValue: {
      totalCandidates: 0,
      pendingReview: 0,
      examCompleted: 0,
      passed: 0,
      rejected: 0,
      activeMemberships: 0,
      expiringSoon: 0,
      expired: 0,
    } as CertificationKpis,
  });

  /* ── Enrollments SCOPED to manager's org ───────────────────────── */
  private enr$ = this.profile$.pipe(
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

  /* ── Courses join ───────────────────────────────────────────────── */
  private rows$ = this.enr$.pipe(
    switchMap(enrs => {
      if (!enrs.length) return of([] as Array<{ enr: EnrollmentDoc; course?: CourseDoc }>);
      const courseIds = Array.from(new Set(enrs.map(e => e.courseId).filter(Boolean)));
      const courseObs = courseIds.map(cid => docData(doc(this.afs, `courses/${cid}`), { idField: 'id' }));
      return (courseObs.length ? combineLatest(courseObs) : of([])).pipe(
        map(coursesRaw => {
          const courseMap = new Map<string, CourseDoc>();
          (coursesRaw as CourseDoc[]).forEach(c => { if (c?.id) courseMap.set(c.id, c); });
          return enrs.map(enr => ({ enr, course: courseMap.get(enr.courseId) }));
        })
      );
    })
  );

  /* ── Users SCOPED to manager's org ─────────────────────────────── */
  private users$: Observable<Map<string, UserDoc>> = this.profile$.pipe(
    switchMap(profile => {
      if (!profile.orgId) return of(new Map<string, UserDoc>());
      const q = query(
        collection(this.afs, 'users'),
        where('orgId', '==', profile.orgId)
      );
      return collectionData(q, { idField: 'id' }).pipe(
        map((list): Map<string, UserDoc> => {
          const m = new Map<string, UserDoc>();
          (list as UserDoc[]).forEach(u => m.set(u.id, u));
          return m;
        })
      );
    })
  );

  private accessRequests$ = this.profile$.pipe(
    switchMap(profile => {
      const role = safeStr(profile.role);
      if (!['admin', 'super_admin', 'superAdmin'].includes(role)) return of([] as AccessRequestDoc[]);
      return collectionData(collection(this.afs, 'courseAccessRequests'), { idField: 'id' }).pipe(
        map((items) => (items || []) as AccessRequestDoc[]),
        catchError((error) => {
          console.warn('Unable to load access requests for manager action center.', error);
          return of([] as AccessRequestDoc[]);
        })
      );
    })
  );

  private pendingAccessRequests$ = this.accessRequests$.pipe(
    map(requests => requests
      .filter(req => ['pending_approval', 'approved_pending_payment'].includes(safeStr(req.status)))
      .sort((a, b) => (epochMs(b.updatedAt) ?? 0) - (epochMs(a.updatedAt) ?? 0))
    )
  );

  private inactiveLearners$ = this.users$.pipe(
    map(users => {
      const cutoff = nowMs() - 7 * DAY;
      return Array.from(users.values())
        .filter(user => safeStr(user.role) === 'learner')
        .filter(user => {
          const lastActivity = firstDefined(
            epochMs(user.activityUpdatedAt),
            epochMs(user.lastSeenAt),
            epochMs(user.lastLoginAt)
          );
          return !lastActivity || lastActivity < cutoff;
        })
        .sort((a, b) => {
          const aTs = firstDefined(epochMs(a.activityUpdatedAt), epochMs(a.lastSeenAt), epochMs(a.lastLoginAt)) ?? 0;
          const bTs = firstDefined(epochMs(b.activityUpdatedAt), epochMs(b.lastSeenAt), epochMs(b.lastLoginAt)) ?? 0;
          return aTs - bTs;
        });
    })
  );

  /* ── Enterprise readiness summary ─────────────────────────────── */
  private readiness$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows, users]) => ({
      learnerCount: users.size,
      activeAssignments: rows.filter(({ enr }) => enr.status !== 'completed').length,
      inProgress: rows.filter(({ enr }) => enr.status === 'started').length,
      completed: rows.filter(({ enr }) => enr.status === 'completed').length,
      uniqueCourses: new Set(rows.map(({ course, enr }) => safeStr(course?.id) || safeStr(enr.courseId)).filter(Boolean)).size,
    }))
  );
  readiness = toSignal(this.readiness$, {
    initialValue: { learnerCount: 0, activeAssignments: 0, inProgress: 0, completed: 0, uniqueCourses: 0 } as Readiness,
  });

  /* ── KPIs ───────────────────────────────────────────────────────── */
  private kpi$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows]) => {
      const now = nowMs();
      const from30 = now - 30 * DAY;
      let completedLast30 = 0, assignedOrStartedLast30 = 0, overdue = 0, sumScore = 0, countScore = 0;

      for (const { enr, course } of rows) {
        const assigned = epochMs(enr.assignedAt);
        const completed = epochMs(enr.completedAt);
        const dueTs = firstDefined(
          epochMs(enr.dueDate), epochMs(course?.dueDate),
          assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined
        );

        if (enr.status !== 'completed' && dueTs && dueTs < now) overdue++;
        if ((assigned && assigned >= from30) || (epochMs(enr.startedAt) ?? 0) >= from30) assignedOrStartedLast30++;
        if (enr.status === 'completed' && completed && completed >= from30) completedLast30++;
        if (enr.status === 'completed' && typeof enr.score === 'number') { sumScore += enr.score; countScore++; }
      }

      return {
        completion30: `${assignedOrStartedLast30 > 0 ? Math.round((completedLast30 / assignedOrStartedLast30) * 100) : 0}%`,
        overdue,
        avgScore: String(countScore > 0 ? Math.round(sumScore / countScore) : 0),
      } satisfies KPI;
    })
  );

  kpi = toSignal(this.kpi$, { initialValue: { completion30: '—', overdue: 0, avgScore: '—' } });

  /* ── Open Assignments ───────────────────────────────────────────── */
  private openAssignments$ = this.rows$.pipe(
    map(rows => {
      const byCourse = new Map<string, { course: CourseDoc; enrs: EnrollmentDoc[] }>();
      for (const { enr, course } of rows) {
        if (enr.status === 'completed') continue;
        const bucket = byCourse.get(enr.courseId) ?? { course: (course || { id: enr.courseId }), enrs: [] };
        bucket.enrs.push(enr);
        byCourse.set(enr.courseId, bucket);
      }
      const now = nowMs();
      return Array.from(byCourse.entries()).map(([courseId, { course, enrs }]) => {
        let nextDue: number | undefined;
        for (const enr of enrs) {
          const assigned = epochMs(enr.assignedAt);
          const due = firstDefined(epochMs(enr.dueDate), epochMs(course?.dueDate), assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined);
          if (due && (nextDue === undefined || due < nextDue)) nextDue = due;
        }
        return {
          id: courseId,
          course: course?.title || courseId,
          audience: `${enrs.length} learner${enrs.length !== 1 ? 's' : ''}`,
          due: nextDue ? fmtDateShort(nextDue) : '—',
          status: 'Active' as const,
          dueTs: nextDue ?? now + 3650 * DAY,
          isOverdue: nextDue ? nextDue < now : false,
        };
      })
      .sort((a, b) => (a.dueTs ?? 0) - (b.dueTs ?? 0))
      .slice(0, 10);
    })
  );
  openAssignments = toSignal(this.openAssignments$, { initialValue: [] as any[] });

  /* ── Recent Results ─────────────────────────────────────────────── */
  private recentResults$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows, users]) => {
      const items: ResultRow[] = [];
      for (const { enr, course } of rows) {
        if (enr.status !== 'completed') continue;
        const completedTs = epochMs(enr.completedAt);
        if (!completedTs) continue;
        const uid = safeStr(enr.uid);
        const userDoc = uid ? users.get(uid) : undefined;
        items.push({
          uid: uid || '(unknown)',
          userName: safeStr(userDoc?.displayName) || uid || '(unknown)',
          userEmail: safeStr(userDoc?.email),
          courseId: enr.courseId,
          course: course?.title || enr.courseId,
          score: typeof enr.score === 'number' ? enr.score : 0,
          completedTs,
          date: fmtDateShort(completedTs),
        });
      }
      return items.sort((a, b) => b.completedTs - a.completedTs).slice(0, 10);
    })
  );
  recentResults = toSignal(this.recentResults$, { initialValue: [] as ResultRow[] });

  /* ── Overdue Alerts ─────────────────────────────────────────────── */
  private overdueAlerts$ = combineLatest([this.rows$, this.users$]).pipe(
    map(([rows, users]) => {
      const now = nowMs();
      return rows
        .filter(({ enr, course }) => {
          if (enr.status === 'completed') return false;
          const assigned = epochMs(enr.assignedAt);
          const dueTs = firstDefined(epochMs(enr.dueDate), epochMs(course?.dueDate), assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined);
          return dueTs && dueTs < now;
        })
        .map(({ enr, course }) => {
          const assigned = epochMs(enr.assignedAt);
          const dueTs = firstDefined(epochMs(enr.dueDate), epochMs(course?.dueDate), assigned ? assigned + DEFAULT_DUE_DAYS * DAY : undefined)!;
          const uid = safeStr(enr.uid);
          const u = uid ? users.get(uid) : undefined;
          return { uid, user: safeStr(u?.displayName) || uid || '(unknown)', email: safeStr(u?.email), course: safeStr(course?.title) || enr.courseId, due: fmtDateShort(dueTs), dueTs };
        })
        .sort((a, b) => a.dueTs - b.dueTs)
        .slice(0, 8);
    })
  );
  overdueAlerts = toSignal(this.overdueAlerts$, { initialValue: [] as any[] });

  pendingAccessRequests = toSignal(this.pendingAccessRequests$, {
    initialValue: [] as AccessRequestDoc[],
  });
  inactiveLearners = toSignal(this.inactiveLearners$, {
    initialValue: [] as UserDoc[],
  });

  private managerActions$ = combineLatest([
    this.overdueAlerts$,
    this.pendingAccessRequests$,
    this.inactiveLearners$,
  ]).pipe(
    map(([overdue, pendingRequests, inactiveLearners]) => ([
      {
        label: 'Overdue learning',
        value: overdue.length,
        detail: overdue.length
          ? 'Send reminders or review assignment dates.'
          : 'No overdue learners right now.',
        tone: 'warn',
        route: '/manager/audit',
        cta: 'Open audit',
      },
      {
        label: 'Access & payment',
        value: pendingRequests.length,
        detail: pendingRequests.length
          ? 'Approve access or mark paid to unlock courses.'
          : 'No pending access requests.',
        tone: 'teal',
        route: '/manager/access-requests',
        cta: 'Review requests',
      },
      {
        label: 'Learner follow-up',
        value: inactiveLearners.length,
        detail: inactiveLearners.length
          ? 'Learners have no activity in the last 7 days.'
          : 'Learners are recently active.',
        tone: 'navy',
        route: '/manager/learners',
        cta: 'View learners',
      },
    ] as ManagerActionCard[]))
  );
  managerActions = toSignal(this.managerActions$, { initialValue: [] as ManagerActionCard[] });

  /* ── Navigation ─────────────────────────────────────────────────── */
  onAssignTraining() { this.router.navigate(['/manager/assign']); }
  onOpenLibrary()    { this.router.navigate(['/manager/courses']); }
  onOpenAudit()      { this.router.navigate(['/manager/audit']); }
  onOpenPolicyLibrary() { this.router.navigate(['/manager/policies']); }
  onCreatePolicy()   { this.router.navigate(['/manager/policy/new']); }
  onPolicyReport()   { this.router.navigate(['/manager/policy-report']); }
  onCreateNotification() { this.router.navigate(['/manager/notify']); }
  onCreateWounds()   { this.router.navigate(['/manager/wounds']); }
  onViewLearners()   { this.router.navigate(['/manager/learners']); }
  onOpenSettings()   { this.router.navigate(['/manager/setting']); }
  onExportCSV() {
    const overdue = this.overdueAlerts();
    const openAssignments = this.openAssignments();
    const results = this.recentResults();

    const rows = [
      ['section', 'user', 'email', 'course', 'date', 'score', 'status'],
      ...overdue.map(item => ['overdue', item.user, item.email || '', item.course, item.due, '', 'past_due']),
      ...openAssignments.map(item => ['assignment', '', '', item.course, item.due, '', item.isOverdue ? 'overdue' : 'active']),
      ...results.map(item => ['completion', item.userName, item.userEmail || '', item.course, item.date, String(item.score), 'completed']),
    ];

    const csv = rows
      .map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `manager-ops-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.notice = 'Operational CSV exported.';
  }
  clearNotice()      { this.notice = ''; }
}
