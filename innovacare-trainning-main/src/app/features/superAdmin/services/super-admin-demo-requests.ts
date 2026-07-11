import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  arrayUnion,
  collection,
  collectionData,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export type DemoRequestStatus = 'new' | 'reviewing' | 'contacted' | 'qualified' | 'converted' | 'closed';
export type DemoRequestPriority = 'normal' | 'high' | 'urgent';

export interface SuperAdminDemoRequest {
  id?: string;
  fullName: string;
  workEmail: string;
  phone?: string;
  organizationName: string;
  organizationType: string;
  selectedPlan?: string;
  message: string;
  source?: string;
  status?: DemoRequestStatus;
  priority?: DemoRequestPriority;
  internalNotes?: string;
  responseDraft?: string;
  createdAt?: any;
  updatedAt?: any;
  respondedAt?: any;
  closedAt?: any;
  lastActionAt?: any;
  lastActionBy?: string | null;
  activity?: Array<{
    action: string;
    actorEmail?: string | null;
    note?: string;
    at?: any;
  }>;
}

@Injectable({ providedIn: 'root' })
export class SuperAdminDemoRequestsService {
  private readonly afs = inject(Firestore);
  private readonly colRef = collection(this.afs, 'demoRequests');

  list(): Observable<SuperAdminDemoRequest[]> {
    const q = query(this.colRef, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<SuperAdminDemoRequest[]>;
  }

  updateStatus(
    requestId: string,
    status: DemoRequestStatus,
    actorEmail?: string | null
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      lastActionAt: serverTimestamp(),
      lastActionBy: actorEmail ?? null,
      updatedAt: serverTimestamp(),
      activity: arrayUnion({
        action: `status:${status}`,
        actorEmail: actorEmail ?? null,
        at: new Date().toISOString(),
      }),
    };

    if (status === 'contacted') patch['respondedAt'] = serverTimestamp();
    if (status === 'closed' || status === 'converted') patch['closedAt'] = serverTimestamp();

    return updateDoc(doc(this.afs, `demoRequests/${requestId}`), patch);
  }

  updatePriority(
    requestId: string,
    priority: DemoRequestPriority,
    actorEmail?: string | null
  ): Promise<void> {
    return updateDoc(doc(this.afs, `demoRequests/${requestId}`), {
      priority,
      lastActionAt: serverTimestamp(),
      lastActionBy: actorEmail ?? null,
      updatedAt: serverTimestamp(),
      activity: arrayUnion({
        action: `priority:${priority}`,
        actorEmail: actorEmail ?? null,
        at: new Date().toISOString(),
      }),
    });
  }

  saveTreatment(
    requestId: string,
    input: {
      internalNotes: string;
      responseDraft: string;
      actorEmail?: string | null;
    }
  ): Promise<void> {
    return updateDoc(doc(this.afs, `demoRequests/${requestId}`), {
      internalNotes: input.internalNotes,
      responseDraft: input.responseDraft,
      lastActionAt: serverTimestamp(),
      lastActionBy: input.actorEmail ?? null,
      updatedAt: serverTimestamp(),
      activity: arrayUnion({
        action: 'treatment:saved',
        actorEmail: input.actorEmail ?? null,
        note: 'Saved internal notes and response draft',
        at: new Date().toISOString(),
      }),
    });
  }

  markResponded(
    requestId: string,
    responseDraft: string,
    actorEmail?: string | null
  ): Promise<void> {
    return updateDoc(doc(this.afs, `demoRequests/${requestId}`), {
      status: 'contacted',
      responseDraft,
      respondedAt: serverTimestamp(),
      lastActionAt: serverTimestamp(),
      lastActionBy: actorEmail ?? null,
      updatedAt: serverTimestamp(),
      activity: arrayUnion({
        action: 'response:sent',
        actorEmail: actorEmail ?? null,
        at: new Date().toISOString(),
      }),
    });
  }
}
