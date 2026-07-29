import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LearningPathsService } from './learning-paths';

export interface IndustryBundle {
  id?: string;
  name: string;
  sector: string;
  description?: string;
  learningPathIds: string[];
  active: boolean;
  assignedOrgIds?: string[];
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string | null;
  createdByEmail?: string | null;
}

export interface OrganizationIndustryBundleAssignment {
  id?: string;
  orgId: string;
  bundleId: string;
  active?: boolean;
  assignedAt?: any;
  assignedByUid?: string | null;
  assignedByEmail?: string | null;
}

@Injectable({ providedIn: 'root' })
export class IndustryBundlesService {
  private readonly afs = inject(Firestore);
  private readonly pathsSvc = inject(LearningPathsService);
  private readonly bundleCol = collection(this.afs, 'industryBundles');
  private readonly assignmentCol = collection(this.afs, 'organizationIndustryBundleAssignments');

  listAll(): Observable<IndustryBundle[]> {
    const q = query(this.bundleCol, orderBy('updatedAt', 'desc'));
    return (collectionData(q, { idField: 'id' }) as Observable<IndustryBundle[]>).pipe(
      map(bundles => this.sortBundles(bundles))
    );
  }

  listAssignments(): Observable<OrganizationIndustryBundleAssignment[]> {
    return collectionData(this.assignmentCol, {
      idField: 'id',
    }) as Observable<OrganizationIndustryBundleAssignment[]>;
  }

  async saveBundle(
    payload: Omit<IndustryBundle, 'id' | 'createdAt' | 'updatedAt'>,
    actor?: { uid?: string; email?: string },
    id?: string
  ): Promise<string> {
    const bundleRef = id ? doc(this.afs, `industryBundles/${id}`) : doc(this.bundleCol);
    const learningPathIds = Array.from(
      new Set((payload.learningPathIds || []).map(v => v.trim()).filter(Boolean))
    );

    await setDoc(
      bundleRef,
      {
        ...payload,
        learningPathIds,
        active: payload.active ?? true,
        assignedOrgIds: payload.assignedOrgIds ?? [],
        createdByUid: payload.createdByUid ?? actor?.uid ?? null,
        createdByEmail: payload.createdByEmail ?? actor?.email ?? null,
        updatedAt: serverTimestamp(),
        ...(id ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );

    return bundleRef.id;
  }

  async deleteBundle(bundleId: string): Promise<void> {
    await deleteDoc(doc(this.afs, `industryBundles/${bundleId}`));
  }

  /**
   * One-click assignment: cascades to every learning path in the bundle,
   * which itself cascades to every course in each path (see LearningPathsService.assignToOrganization).
   */
  async assignToOrganization(
    bundleId: string,
    orgId: string,
    learningPathIds: string[],
    actor?: { uid?: string; email?: string }
  ): Promise<void> {
    for (const pathId of learningPathIds) {
      await this.pathsSvc.assignToOrganization(pathId, orgId, actor);
    }

    const assignmentId = `${orgId}_${bundleId}`;
    await setDoc(
      doc(this.afs, `organizationIndustryBundleAssignments/${assignmentId}`),
      {
        orgId,
        bundleId,
        active: true,
        assignedByUid: actor?.uid ?? null,
        assignedByEmail: actor?.email ?? null,
        assignedAt: serverTimestamp(),
      } satisfies OrganizationIndustryBundleAssignment,
      { merge: true }
    );

    await setDoc(
      doc(this.afs, `industryBundles/${bundleId}`),
      { assignedOrgIds: arrayUnion(orgId), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async removeOrganizationAssignment(assignment: OrganizationIndustryBundleAssignment): Promise<void> {
    if (!assignment.id) throw new Error('Missing assignment id.');
    await deleteDoc(doc(this.afs, `organizationIndustryBundleAssignments/${assignment.id}`));
    await setDoc(
      doc(this.afs, `industryBundles/${assignment.bundleId}`),
      { assignedOrgIds: arrayRemove(assignment.orgId), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  private sortBundles(bundles: IndustryBundle[]): IndustryBundle[] {
    return [...(bundles || [])].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }
}
