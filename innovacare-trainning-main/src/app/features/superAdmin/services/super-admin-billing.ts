import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { SuperAdminBillingRecord } from '../models/super-admin.models';


@Injectable({ providedIn: 'root' })
export class SuperAdminBillingService {
  private afs = inject(Firestore);
  private colRef = collection(this.afs, 'billingRecords');

  list(): Observable<SuperAdminBillingRecord[]> {
    const q = query(this.colRef, orderBy('updatedAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<SuperAdminBillingRecord[]>;
  }

  async create(payload: SuperAdminBillingRecord): Promise<string> {
    const ref = await addDoc(this.colRef, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, payload: Partial<SuperAdminBillingRecord>): Promise<void> {
    const ref = doc(this.afs, `billingRecords/${id}`);
    await updateDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  }
}