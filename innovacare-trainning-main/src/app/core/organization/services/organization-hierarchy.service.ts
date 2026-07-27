import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Organization, OrgType } from '../../../data/models';

export interface CreateRegionInput {
  parentOrgId: string;
  name: string;
  type: OrgType;
  plan: Organization['plan'];
}

@Injectable({ providedIn: 'root' })
export class OrganizationHierarchyService {
  private readonly afs = inject(Firestore);

  listChildren(parentOrgId: string): Observable<Organization[]> {
    const q = query(collection(this.afs, 'organizations'), where('parentOrgId', '==', parentOrgId));
    return collectionData(q, { idField: 'id' }).pipe(map((rows) => rows as Organization[]));
  }

  async createRegion(input: CreateRegionInput): Promise<string> {
    const parentSnap = await getDoc(doc(this.afs, `organizations/${input.parentOrgId}`));
    if (!parentSnap.exists()) {
      throw new Error('Parent organization not found.');
    }

    const parent = parentSnap.data() as Organization;
    const ancestorOrgIds = [...(parent.ancestorOrgIds || []), input.parentOrgId];

    // Pre-generate the ref so orgId/hierarchy fields land in the SAME setDoc
    // as the create call — a follow-up updateDoc would hit the Super-Admin-
    // only update rule instead of the council create rule.
    const ref = doc(collection(this.afs, 'organizations'));
    await setDoc(ref, {
      name: input.name,
      type: input.type,
      plan: input.plan,
      parentOrgId: input.parentOrgId,
      ancestorOrgIds,
      canCreateSubOrgs: false,
      createdAt: serverTimestamp(),
    });

    return ref.id;
  }
}
