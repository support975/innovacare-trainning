import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  setDoc,
  arrayRemove,
  arrayUnion,
} from '@angular/fire/firestore';
import { filter, firstValueFrom, map, Observable, timeout } from 'rxjs';
import { SuperAdminLogsService } from './super-admin-logs';
import { OrganizationCourseAssignment, OrgType, PlanType, SuperAdminOrganization, SuperAdminUser } from '../models/super-admin.models';

type GeneratedOwnerResult = {
  orgId: string;
  ownerUid: string;
  ownerEmail: string;
  temporaryPassword: string;
};

type OrganizationAdminCreateRequest = {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  result?: GeneratedOwnerResult;
  error?: {
    message?: string;
    code?: string;
  };
};

type CourseAssignmentBackfillRequest = {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  updatedCourses?: number;
  updatedLearningPaths?: number;
  assignmentCount?: number;
  pathAssignmentCount?: number;
  removedEnrollments?: number;
  error?: {
    message?: string;
  };
};


@Injectable({ providedIn: 'root' })
export class SuperAdminOrganizationsService {
  private afs = inject(Firestore);
  private auth = inject(Auth);
  private logs = inject(SuperAdminLogsService);

  private colRef = collection(this.afs, 'organizations');
  private assignmentColRef = collection(this.afs, 'organizationCourseAssignments');

  list(): Observable<SuperAdminOrganization[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<SuperAdminOrganization[]>;
  }

  listFiltered(
    search = '',
    type: OrgType | 'all' = 'all',
    plan: PlanType | 'all' = 'all'
  ): Observable<SuperAdminOrganization[]> {
    const term = search.trim().toLowerCase();

    return this.list().pipe(
      map((rows) =>
        rows.filter((org) => {
          const matchesType = type === 'all' ? true : org.type === type;
          const matchesPlan = plan === 'all' ? true : org.plan === plan;
          const blob = `${org.name ?? ''} ${org.ownerEmail ?? ''} ${org.id ?? ''}`.toLowerCase();
          const matchesSearch = !term || blob.includes(term);
          return matchesType && matchesPlan && matchesSearch;
        })
      )
    );
  }

  listPage(
    search = '',
    type: OrgType | 'all' = 'all',
    plan: PlanType | 'all' = 'all',
    page = 1,
    pageSize = 10
  ): Observable<{ total: number; items: SuperAdminOrganization[] }> {
    return this.listFiltered(search, type, plan).pipe(
      map((rows) => {
        const total = rows.length;
        const start = Math.max(0, (page - 1) * pageSize);
        const items = rows.slice(start, start + pageSize);
        return { total, items };
      })
    );
  }

  getById(id: string): Observable<SuperAdminOrganization | null> {
    const ref = doc(this.afs, `organizations/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<SuperAdminOrganization | null>;
  }

  async create(
    payload: SuperAdminOrganization,
    actor?: { uid?: string; email?: string }
  ): Promise<string> {
    const ref = await addDoc(this.colRef, {
      ...payload,
      active: payload.active ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await this.logs.audit({
      action: 'CREATE_ORGANIZATION',
      targetType: 'organization',
      targetId: ref.id,
      actorUid: actor?.uid,
      actorEmail: actor?.email,
      message: `Organization created: ${payload.name}`,
      meta: { name: payload.name, type: payload.type, plan: payload.plan },
    });

    return ref.id;
  }

  async createWithOwner(params: {
    organization: Omit<SuperAdminOrganization, 'id' | 'createdAt' | 'updatedAt' | 'ownerUid' | 'ownerEmail'>;
    owner: {
      uid: string;
      email: string;
      displayName?: string;
    };
    actor?: { uid?: string; email?: string };
  }): Promise<string> {
    const orgRef = await addDoc(this.colRef, {
      ...params.organization,
      active: params.organization.active ?? true,
      ownerUid: params.owner.uid,
      ownerEmail: params.owner.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const userRef = doc(this.afs, `users/${params.owner.uid}`);
    const ownerUser: SuperAdminUser = {
      uid: params.owner.uid,
      email: params.owner.email,
      displayName: params.owner.displayName ?? '',
      role: 'admin',
      orgId: orgRef.id,
      orgType: params.organization.type,
      active: true,
    };

    await setDoc(
      userRef,
      {
        ...ownerUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await this.logs.audit({
      action: 'CREATE_ORGANIZATION_WITH_OWNER',
      targetType: 'organization',
      targetId: orgRef.id,
      actorUid: params.actor?.uid,
      actorEmail: params.actor?.email,
      message: `Organization ${params.organization.name} created with owner ${params.owner.email}`,
      meta: {
        orgName: params.organization.name,
        orgType: params.organization.type,
        plan: params.organization.plan,
        ownerUid: params.owner.uid,
        ownerEmail: params.owner.email,
      },
    });

    return orgRef.id;
  }

  async createWithGeneratedOwner(params: {
    organization: Omit<SuperAdminOrganization, 'id' | 'createdAt' | 'updatedAt' | 'ownerUid' | 'ownerEmail'>;
    owner: {
      email: string;
      displayName?: string;
    };
  }): Promise<GeneratedOwnerResult> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required.');
    }

    const requestRef = await addDoc(collection(this.afs, 'organizationAdminCreateRequests'), {
      status: 'pending',
      requestedByUid: currentUser.uid,
      requestedByEmail: currentUser.email || '',
      organization: {
        name: params.organization.name,
        type: params.organization.type,
        plan: params.organization.plan,
        active: params.organization.active ?? true,
        orgId: params.organization.orgId || undefined,
        learnerLimit: params.organization.learnerLimit ?? null,
      },
      owner: {
        email: params.owner.email,
        displayName: params.owner.displayName || '',
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const request = await firstValueFrom(
      docData(requestRef).pipe(
        filter((doc): doc is OrganizationAdminCreateRequest => {
          const status = (doc as OrganizationAdminCreateRequest | undefined)?.status;
          return status === 'completed' || status === 'failed';
        }),
        timeout(120000)
      )
    );

    if (request.status === 'failed') {
      throw new Error(request.error?.message || 'Failed to create organization.');
    }

    if (!request.result) {
      throw new Error('Organization created, but the result was not returned.');
    }

    return request.result;
  }

  async update(
    id: string,
    payload: Partial<SuperAdminOrganization>,
    actor?: { uid?: string; email?: string }
  ): Promise<void> {
    const ref = doc(this.afs, `organizations/${id}`);
    await updateDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp(),
    });

    await this.logs.audit({
      action: 'UPDATE_ORGANIZATION',
      targetType: 'organization',
      targetId: id,
      actorUid: actor?.uid,
      actorEmail: actor?.email,
      message: `Organization updated`,
      meta: payload,
    });
  }

  async delete(
    id: string,
    actor?: { uid?: string; email?: string }
  ): Promise<void> {
    const ref = doc(this.afs, `organizations/${id}`);
    await deleteDoc(ref);

    await this.logs.audit({
      action: 'DELETE_ORGANIZATION',
      targetType: 'organization',
      targetId: id,
      actorUid: actor?.uid,
      actorEmail: actor?.email,
      message: `Organization deleted`,
      severity: 'warning',
    });
  }

  async assignCourseToOrganization(params: {
    orgId: string;
    courseId: string;
    actor?: { uid?: string; email?: string };
  }): Promise<string> {
    const assignmentId = `${params.orgId}_${params.courseId}`;
    const assignmentRef = doc(this.afs, `organizationCourseAssignments/${assignmentId}`);

    await setDoc(assignmentRef, {
      orgId: params.orgId,
      courseId: params.courseId,
      active: true,
      assignedByUid: params.actor?.uid ?? null,
      assignedByEmail: params.actor?.email ?? null,
      assignedAt: serverTimestamp(),
    } satisfies OrganizationCourseAssignment, { merge: true });

    await updateDoc(doc(this.afs, `courses/${params.courseId}`), {
      assignedOrgIds: arrayUnion(params.orgId),
      updatedAt: serverTimestamp(),
    });

    await this.logs.audit({
      action: 'ASSIGN_COURSE_TO_ORGANIZATION',
      targetType: 'organizationCourseAssignment',
      targetId: assignmentId,
      actorUid: params.actor?.uid,
      actorEmail: params.actor?.email,
      message: `Course assigned to organization`,
      meta: {
        orgId: params.orgId,
        courseId: params.courseId,
      },
    });

    return assignmentId;
  }

  listCourseAssignments(): Observable<OrganizationCourseAssignment[]> {
    return collectionData(this.assignmentColRef, { idField: 'id' }) as Observable<OrganizationCourseAssignment[]>;
  }

  async requestCourseAssignmentBackfill(): Promise<{
    updatedCourses: number;
    updatedLearningPaths: number;
    assignmentCount: number;
    pathAssignmentCount: number;
    removedEnrollments: number;
  }> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in required.');
    }

    const requestRef = await addDoc(collection(this.afs, 'courseAssignmentBackfillRequests'), {
      status: 'pending',
      requestedByUid: currentUser.uid,
      requestedByEmail: currentUser.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const request = await firstValueFrom(
      docData(requestRef).pipe(
        filter((doc): doc is CourseAssignmentBackfillRequest => {
          const status = (doc as CourseAssignmentBackfillRequest | undefined)?.status;
          return status === 'completed' || status === 'failed';
        }),
        timeout(120000)
      )
    );

    if (request.status === 'failed') {
      throw new Error(request.error?.message || 'Course assignment sync failed.');
    }

    return {
      updatedCourses: request.updatedCourses ?? 0,
      updatedLearningPaths: request.updatedLearningPaths ?? 0,
      assignmentCount: request.assignmentCount ?? 0,
      pathAssignmentCount: request.pathAssignmentCount ?? 0,
      removedEnrollments: request.removedEnrollments ?? 0,
    };
  }

  async removeCourseAssignment(
    assignment: Pick<OrganizationCourseAssignment, 'id' | 'orgId' | 'courseId'>,
    actor?: { uid?: string; email?: string }
  ): Promise<void> {
    if (!assignment.id) throw new Error('Missing assignment id.');

    await deleteDoc(doc(this.afs, `organizationCourseAssignments/${assignment.id}`));

    await updateDoc(doc(this.afs, `courses/${assignment.courseId}`), {
      assignedOrgIds: arrayRemove(assignment.orgId),
      updatedAt: serverTimestamp(),
    });

    await this.logs.audit({
      action: 'REMOVE_COURSE_FROM_ORGANIZATION',
      targetType: 'organizationCourseAssignment',
      targetId: assignment.id,
      actorUid: actor?.uid,
      actorEmail: actor?.email,
      message: `Course assignment removed from organization`,
      severity: 'warning',
      meta: {
        orgId: assignment.orgId,
        courseId: assignment.courseId,
      },
    });
  }

  listAssignmentsForOrg(orgId: string): Observable<OrganizationCourseAssignment[]> {
    const q = query(collection(this.afs, 'organizationCourseAssignments'));
    return collectionData(q, { idField: 'id' }).pipe(
      map((rows: any[]) => rows.filter((x) => x.orgId === orgId))
    ) as Observable<OrganizationCourseAssignment[]>;
  }
}
