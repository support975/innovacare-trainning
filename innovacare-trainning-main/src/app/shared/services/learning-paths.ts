import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, combineLatest, from, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppProfile } from '../../core/auth';

export interface LearningPath {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  durationDays?: number | null;
  courseIds: string[];
  active: boolean;
  assignedOrgIds?: string[];
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string | null;
  createdByEmail?: string | null;
}

export interface OrganizationLearningPathAssignment {
  id?: string;
  orgId: string;
  pathId: string;
  active?: boolean;
  assignedAt?: any;
  assignedByUid?: string | null;
  assignedByEmail?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LearningPathsService {
  private readonly afs = inject(Firestore);
  private readonly pathCol = collection(this.afs, 'learningPaths');
  private readonly assignmentCol = collection(this.afs, 'organizationLearningPathAssignments');

  listAll(): Observable<LearningPath[]> {
    const q = query(this.pathCol, orderBy('updatedAt', 'desc'));
    return (collectionData(q, { idField: 'id' }) as Observable<LearningPath[]>).pipe(
      map(paths => this.sortPaths(paths))
    );
  }

  visibleForProfile(profile: AppProfile | null): Observable<LearningPath[]> {
    if (!profile) return of([]);
    const role = String(profile.role ?? '');
    if (role === 'super_admin' || role === 'superAdmin') return this.listAll();
    if (!profile.orgId) return of([]);

    const q = query(
      this.pathCol,
      where('assignedOrgIds', 'array-contains', profile.orgId),
      where('active', '==', true)
    );
    const assignedByArray$ = (collectionData(q, { idField: 'id' }) as Observable<LearningPath[]>).pipe(
      catchError(() => of([] as LearningPath[]))
    );
    const assignedByMapping$ = this.listAssignmentsForOrg(profile.orgId).pipe(
      switchMap(assignments => this.loadMappedPaths(assignments)),
      catchError(() => of([] as LearningPath[]))
    );

    return combineLatest([assignedByArray$, assignedByMapping$]).pipe(
      map(([arrayPaths, mappedPaths]) => {
        const merged = new Map<string, LearningPath>();
        [...arrayPaths, ...mappedPaths]
          .filter(path => path.active !== false)
          .forEach(path => {
            const key = String(path.id ?? '');
            if (key) merged.set(key, path);
          });
        return this.sortPaths(Array.from(merged.values()));
      })
    );
  }

  listAssignments(): Observable<OrganizationLearningPathAssignment[]> {
    return collectionData(this.assignmentCol, { idField: 'id' }) as Observable<OrganizationLearningPathAssignment[]>;
  }

  listAssignmentsForOrg(orgId: string): Observable<OrganizationLearningPathAssignment[]> {
    if (!orgId) return of([]);
    const q = query(this.assignmentCol, where('orgId', '==', orgId));
    return (collectionData(q, { idField: 'id' }) as Observable<OrganizationLearningPathAssignment[]>).pipe(
      catchError(() => of([] as OrganizationLearningPathAssignment[]))
    );
  }

  listVisibleWithAssignments(profile: AppProfile | null): Observable<LearningPath[]> {
    if (!profile?.orgId) return this.visibleForProfile(profile);
    return this.listAssignmentsForOrg(profile.orgId).pipe(
      switchMap(() => this.visibleForProfile(profile))
    );
  }

  async savePath(
    payload: Omit<LearningPath, 'id' | 'createdAt' | 'updatedAt'>,
    actor?: { uid?: string; email?: string },
    id?: string
  ): Promise<string> {
    const pathRef = id ? doc(this.afs, `learningPaths/${id}`) : doc(this.pathCol);
    const courseIds = Array.from(new Set((payload.courseIds || []).map(v => v.trim()).filter(Boolean)));

    await setDoc(
      pathRef,
      {
        ...payload,
        courseIds,
        active: payload.active ?? true,
        assignedOrgIds: payload.assignedOrgIds ?? [],
        createdByUid: payload.createdByUid ?? actor?.uid ?? null,
        createdByEmail: payload.createdByEmail ?? actor?.email ?? null,
        updatedAt: serverTimestamp(),
        ...(id ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );

    return pathRef.id;
  }

  async deletePath(pathId: string): Promise<void> {
    await deleteDoc(doc(this.afs, `learningPaths/${pathId}`));
  }

  async assignToOrganization(
    pathId: string,
    orgId: string,
    actor?: { uid?: string; email?: string }
  ): Promise<void> {
    const assignmentId = `${orgId}_${pathId}`;
    await setDoc(
      doc(this.afs, `organizationLearningPathAssignments/${assignmentId}`),
      {
        orgId,
        pathId,
        active: true,
        assignedByUid: actor?.uid ?? null,
        assignedByEmail: actor?.email ?? null,
        assignedAt: serverTimestamp(),
      } satisfies OrganizationLearningPathAssignment,
      { merge: true }
    );

    await updateDoc(doc(this.afs, `learningPaths/${pathId}`), {
      assignedOrgIds: arrayUnion(orgId),
      updatedAt: serverTimestamp(),
    });

    const pathSnap = await getDoc(doc(this.afs, `learningPaths/${pathId}`));
    const path = pathSnap.exists() ? (pathSnap.data() as LearningPath) : null;
    const courseIds = Array.from(new Set((path?.courseIds ?? []).filter(Boolean)));
    if (!courseIds.length) return;

    const batch = writeBatch(this.afs);
    courseIds.forEach(courseId => {
      batch.update(doc(this.afs, `courses/${courseId}`), {
        assignedOrgIds: arrayUnion(orgId),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  async removeOrganizationAssignment(assignment: OrganizationLearningPathAssignment): Promise<void> {
    if (!assignment.id) throw new Error('Missing assignment id.');
    await deleteDoc(doc(this.afs, `organizationLearningPathAssignments/${assignment.id}`));
    await updateDoc(doc(this.afs, `learningPaths/${assignment.pathId}`), {
      assignedOrgIds: arrayRemove(assignment.orgId),
      updatedAt: serverTimestamp(),
    });
  }

  private sortPaths(paths: LearningPath[]): LearningPath[] {
    return [...(paths || [])].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    );
  }

  private loadMappedPaths(assignments: OrganizationLearningPathAssignment[]): Observable<LearningPath[]> {
    const pathIds = Array.from(new Set(
      (assignments || [])
        .filter(assignment => assignment.active !== false)
        .map(assignment => String(assignment.pathId || '').trim())
        .filter(Boolean)
    ));

    if (!pathIds.length) return of([]);

    return from(Promise.all(pathIds.map(async pathId => {
      try {
        const snap = await getDoc(doc(this.afs, `learningPaths/${pathId}`));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as LearningPath) : null;
      } catch {
        return null;
      }
    }))).pipe(
      map(paths => paths.filter((path): path is LearningPath => !!path))
    );
  }
}
