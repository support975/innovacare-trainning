import { computed, inject, Injectable, Signal } from '@angular/core';
import { addDoc, getDoc, setDoc, writeBatch } from '@angular/fire/firestore';
import {  doc, updateDoc, deleteDoc, serverTimestamp } from '@angular/fire/firestore';
import {
  Firestore, collection, collectionData, query, where
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, from, map, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { Course } from './models';
import { AppProfile } from '../core/auth';
import { canAccessCourseByEmail } from '../shared/course-domain-access';

type OrganizationCourseAssignment = {
  id?: string;
  orgId?: string;
  courseId?: string;
  active?: boolean;
};

function sanitizeFirestoreValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeFirestoreValue(item))
      .filter(item => item !== undefined) as T;
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, sanitizeFirestoreValue(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function courseSortValue(course: Course): number {
  const value = Number(course.sortOrder);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => {
    const byOrder = courseSortValue(a) - courseSortValue(b);
    if (byOrder !== 0) return byOrder;
    return (a.title || '').localeCompare(b.title || '');
  });
}

function filterCoursesForEmail(courses: Course[], email?: string | null): Course[] {
  return courses.filter(course => canAccessCourseByEmail(course, email));
}

@Injectable({ providedIn: 'root' })
export class CoursesRepo {
  private fs = inject(Firestore);
  private col = collection(this.fs, 'courses');
  private assignmentCol = collection(this.fs, 'organizationCourseAssignments');
  private courses$ = (collectionData(this.col, { idField: 'id' }) as Observable<Course[]>).pipe(
    map(sortCourses),
    catchError(() => of([] as Course[]))
  );
  private _all: Signal<Course[]> = toSignal(
    (collectionData(this.col, { idField: 'id' }) as Observable<Course[]>).pipe(
      map(sortCourses),
      catchError(() => of([] as Course[]))
    ),
    { initialValue: [] }
  );

  readonly courses: Signal<Course[]> = toSignal(this.courses$, { initialValue: [] });

  visibleForProfile(profile: AppProfile | null): Observable<Course[]> {
    if (!profile) return of([]);

    const role = String(profile.role ?? '');

    if (role === 'super_admin' || role === 'superAdmin') {
      return this.courses$;
    }

    if ((role === 'admin' || role === 'manager' || role === 'learner') && profile.orgId) {
      const assignedCoursesQuery = query(
        this.col,
        where('assignedOrgIds', 'array-contains', profile.orgId)
      );

      const legacyOrgCoursesQuery = query(
        this.col,
        where('orgId', '==', profile.orgId)
      );

      const orgAssignmentQuery = query(
        this.assignmentCol,
        where('orgId', '==', profile.orgId)
      );

      const mappedCourses$ = (collectionData(orgAssignmentQuery, { idField: 'id' }) as Observable<OrganizationCourseAssignment[]>).pipe(
        switchMap(assignments => this.loadMappedCourses(assignments))
      );

      return combineLatest([
        (collectionData(assignedCoursesQuery, { idField: 'id' }) as Observable<Course[]>).pipe(
          catchError(() => of([] as Course[]))
        ),
        (collectionData(legacyOrgCoursesQuery, { idField: 'id' }) as Observable<Course[]>).pipe(
          catchError(() => of([] as Course[]))
        ),
        mappedCourses$.pipe(catchError(() => of([] as Course[]))),
      ]).pipe(
        map(([assignedCourses, legacyOrgCourses, mappedCourses]) => {
          const merged = new Map<string, Course>();
          [...assignedCourses, ...legacyOrgCourses, ...mappedCourses].forEach((course) => {
            const key = String(course.id ?? '');
            if (!key) return;
            merged.set(key, course);
          });
          return sortCourses(Array.from(merged.values()).filter(course => course.active !== false));
        })
      );
    }

    const publicCoursesQuery = query(
      this.col,
      where('active', '==', true),
      where('isPublic', '==', true)
    );
    return (collectionData(publicCoursesQuery, { idField: 'id' }) as Observable<Course[]>).pipe(
      map(courses => sortCourses(filterCoursesForEmail(courses, profile.email)))
    );
  }

  allActive(): Signal<Course[]> {
    const q = query(this.col, where('active', '==', true));

    // Strongly type the observable
    const stream = (collectionData(q, { idField: 'id' }) as Observable<Course[]>).pipe(map(sortCourses));

    // toSignal may be typed as Signal<Course[] | undefined> in your env
    const raw = toSignal(stream) as unknown as Signal<Course[] | undefined>;

    // ✅ Always return Signal<Course[]> (no undefined)
    return computed(() => raw() ?? []);
  }

  add(course: Omit<Course, 'id'|'createdAt'|'updatedAt'>) {
    return addDoc(this.col, sanitizeFirestoreValue({
      ...course,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  }

  update(id: string, patch: Partial<Course>) {
    return updateDoc(doc(this.fs, 'courses', id), sanitizeFirestoreValue({ ...patch, updatedAt: serverTimestamp() }));
  }

  async updateCourseSortOrders(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
    const normalized = updates.filter((item) => item.id && Number.isFinite(Number(item.sortOrder)));
    const MAX_PER_BATCH = 400;

    for (let i = 0; i < normalized.length; i += MAX_PER_BATCH) {
      const batch = writeBatch(this.fs);
      const slice = normalized.slice(i, i + MAX_PER_BATCH);

      for (const item of slice) {
        batch.update(doc(this.fs, 'courses', item.id), {
          sortOrder: Number(item.sortOrder),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    }
  }

  remove(id: string) {
    return deleteDoc(doc(this.fs, 'courses', id));
  }

  all(): Signal<Course[]> {
    return this._all;
  }

  getOne(courseId: string) {
    return doc(this.fs, 'courses', courseId);
  }

  private loadMappedCourses(assignments: OrganizationCourseAssignment[]): Observable<Course[]> {
    const courseIds = Array.from(new Set(
      (assignments || [])
        .filter(assignment => assignment.active !== false)
        .map(assignment => String(assignment.courseId || '').trim())
        .filter(Boolean)
    ));

    if (!courseIds.length) return of([]);

    return from(Promise.all(courseIds.map(async courseId => {
      try {
        const snap = await getDoc(doc(this.fs, 'courses', courseId));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as Course) : null;
      } catch {
        return this.fallbackMappedCourse(courseId);
      }
    }))).pipe(
      map(courses => sortCourses(courses.filter((course): course is Course => !!course && course.active !== false)))
    );
  }

  private fallbackMappedCourse(courseId: string): Course {
    return {
      id: courseId,
      title: courseId,
      description: '',
      lang: 'EN',
      durationMin: 0,
      active: true,
      kind: 'Course',
      url: '',
      sections: [],
      lecturer: '',
      disclosures: [],
      targetAudience: [],
      prerequisites: [],
      requirements: [],
      accomodations: '',
      passingScore: 0,
      lockedSequence: false,
      type: 'Health',
      level: 'Beginner',
    };
  }
  
  async load(courseId: string): Promise<Course | null> {
    const snap = await getDoc(this.getOne(courseId));
    return snap.exists() ? (snap.data() as Course) : null;
  }
  async create(course: Course) {
    const ref = doc(collection(this.fs, 'courses'));
    await setDoc(ref, sanitizeFirestoreValue({ ...course, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    return ref.id;
  }
  
  

}
