import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  doc,
  docData,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { SuperAdminUser, UserRole } from '../models/super-admin.models';

type EnrollmentAnalyticsDoc = {
  uid?: string;
  courseId?: string;
  status?: string;
  progress?: number;
  score?: number;
  assignedAt?: any;
  startedAt?: any;
  completedAt?: any;
  updatedAt?: any;
  gradedAt?: any;
  dueDate?: any;
};

type CourseAnalyticsDoc = {
  id?: string;
  durationMin?: number;
};

export type SuperAdminUserAnalytics = {
  lastSeenAt: number | null;
  activeCourses: number;
  completedCourses: number;
  averageProgress: number | null;
  averageScore: number | null;
  estimatedStudyMinutes: number;
  totalAppMinutes: number;
};

export type SuperAdminUserWithAnalytics = SuperAdminUser & {
  analytics: SuperAdminUserAnalytics;
};

const DEFAULT_STARTED_PROGRESS = 25;

function epochMs(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return null;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

@Injectable({ providedIn: 'root' })
export class SuperAdminUsersService {
  private afs = inject(Firestore);
  private colRef = collection(this.afs, 'users');

  list(): Observable<SuperAdminUser[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'uid' }) as Observable<SuperAdminUser[]>;
  }

  listFiltered(search = '', role: UserRole | 'all' = 'all'): Observable<SuperAdminUser[]> {
    const term = search.trim().toLowerCase();

    return this.list().pipe(
      map((rows) =>
        rows.filter((u) => {
          const matchesRole = role === 'all' ? true : u.role === role;
          const blob = `${u.displayName ?? ''} ${u.email ?? ''} ${u.uid ?? ''}`.toLowerCase();
          const matchesSearch = !term || blob.includes(term);
          return matchesRole && matchesSearch;
        })
      )
    );
  }

  listFilteredWithAnalytics(
    search = '',
    role: UserRole | 'all' = 'all'
  ): Observable<SuperAdminUserWithAnalytics[]> {
    return this.listFiltered(search, role).pipe(
      switchMap((users) => {
        if (!users.length) return of([] as SuperAdminUserWithAnalytics[]);

        const learnerIds = users
          .filter((user) => user.role === 'learner' && !!user.uid)
          .map((user) => user.uid);

        const enrollments$ = learnerIds.length
          ? collectionData(collectionGroup(this.afs, 'enrollments')).pipe(
              map((rows) =>
                (rows as EnrollmentAnalyticsDoc[]).filter((row) =>
                  row.uid ? learnerIds.includes(row.uid) : false
                )
              )
            )
          : of([] as EnrollmentAnalyticsDoc[]);

        return combineLatest([of(users), enrollments$, this.listCoursesAnalytics()]).pipe(
          map(([baseUsers, enrollments, courses]) => {
            const courseMap = new Map<string, CourseAnalyticsDoc>();
            for (const course of courses) {
              if (course.id) courseMap.set(course.id, course);
            }

            const enrollmentsByUid = new Map<string, EnrollmentAnalyticsDoc[]>();
            for (const enrollment of enrollments) {
              const uid = enrollment.uid;
              if (!uid) continue;
              const bucket = enrollmentsByUid.get(uid) ?? [];
              bucket.push(enrollment);
              enrollmentsByUid.set(uid, bucket);
            }

            return baseUsers.map((user) => ({
              ...user,
              analytics: this.buildAnalytics(user, enrollmentsByUid.get(user.uid) ?? [], courseMap),
            }));
          })
        );
      })
    );
  }

  getByUid(uid: string): Observable<SuperAdminUser | null> {
    const ref = doc(this.afs, `users/${uid}`);
    return docData(ref, { idField: 'uid' }) as Observable<SuperAdminUser | null>;
  }

  async upsert(user: SuperAdminUser): Promise<void> {
    const ref = doc(this.afs, `users/${user.uid}`);
    await setDoc(
      ref,
      {
        ...user,
        active: user.active ?? true,
        updatedAt: serverTimestamp(),
        createdAt: user.createdAt ?? serverTimestamp(),
      },
      { merge: true }
    );
  }

  async setRole(uid: string, role: UserRole): Promise<void> {
    const ref = doc(this.afs, `users/${uid}`);
    await updateDoc(ref, {
      role,
      updatedAt: serverTimestamp(),
    });
  }

  async setOrganization(uid: string, orgId: string | null, orgType?: SuperAdminUser['orgType']): Promise<void> {
    const ref = doc(this.afs, `users/${uid}`);
    await updateDoc(ref, {
      orgId,
      orgType: orgType ?? null,
      updatedAt: serverTimestamp(),
    });
  }

  async setActive(uid: string, active: boolean): Promise<void> {
    const ref = doc(this.afs, `users/${uid}`);
    await updateDoc(ref, {
      active,
      updatedAt: serverTimestamp(),
    });
  }

  private listCoursesAnalytics(): Observable<CourseAnalyticsDoc[]> {
    return collectionData(collection(this.afs, 'courses'), { idField: 'id' }) as Observable<CourseAnalyticsDoc[]>;
  }

  private buildAnalytics(
    user: SuperAdminUser,
    enrollments: EnrollmentAnalyticsDoc[],
    courseMap: Map<string, CourseAnalyticsDoc>
  ): SuperAdminUserAnalytics {
    const userActivityCandidates = [
      epochMs((user as any).lastSeenAt),
      epochMs((user as any).lastLoginAt),
      epochMs((user as any).activityUpdatedAt),
      epochMs((user as any).updatedAt),
      epochMs((user as any).createdAt),
    ].filter((value): value is number => value !== null);

    const totalAppSeconds = Math.max(0, Number((user as any).totalAppSeconds ?? 0));

    let lastSeenAt = userActivityCandidates.length ? Math.max(...userActivityCandidates) : null;
    let activeCourses = 0;
    let completedCourses = 0;
    let estimatedStudyMinutes = 0;
    let progressTotal = 0;
    let progressCount = 0;
    let scoreTotal = 0;
    let scoreCount = 0;

    for (const enrollment of enrollments) {
      const course = enrollment.courseId ? courseMap.get(enrollment.courseId) : undefined;
      const durationMin = Math.max(0, Number(course?.durationMin ?? 0));

      const enrollmentActivity = [
        epochMs(enrollment.updatedAt),
        epochMs(enrollment.completedAt),
        epochMs(enrollment.gradedAt),
        epochMs(enrollment.startedAt),
        epochMs(enrollment.assignedAt),
      ].filter((value): value is number => value !== null);

      if (enrollmentActivity.length) {
        const latestEnrollmentActivity = Math.max(...enrollmentActivity);
        lastSeenAt = lastSeenAt === null ? latestEnrollmentActivity : Math.max(lastSeenAt, latestEnrollmentActivity);
      }

      const status = String(enrollment.status ?? '');
      if (status === 'completed') completedCourses += 1;
      if (status === 'started' || status === 'in_progress') activeCourses += 1;

      let progressValue: number | null = null;
      if (typeof enrollment.progress === 'number' && Number.isFinite(enrollment.progress)) {
        progressValue = clampProgress(enrollment.progress);
      } else if (status === 'completed') {
        progressValue = 100;
      } else if (status === 'started' || status === 'in_progress') {
        progressValue = DEFAULT_STARTED_PROGRESS;
      } else if (status === 'assigned') {
        progressValue = 0;
      }

      if (progressValue !== null) {
        progressTotal += progressValue;
        progressCount += 1;
        estimatedStudyMinutes += Math.round(durationMin * (progressValue / 100));
      }

      if (typeof enrollment.score === 'number' && Number.isFinite(enrollment.score)) {
        scoreTotal += enrollment.score;
        scoreCount += 1;
      }
    }

    return {
      lastSeenAt,
      activeCourses,
      completedCourses,
      averageProgress: progressCount ? Math.round(progressTotal / progressCount) : null,
      averageScore: scoreCount ? Math.round(scoreTotal / scoreCount) : null,
      estimatedStudyMinutes,
      totalAppMinutes: totalAppSeconds > 0 ? Math.max(1, Math.ceil(totalAppSeconds / 60)) : 0,
    };
  }
}
