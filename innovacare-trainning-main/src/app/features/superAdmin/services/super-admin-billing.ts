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

  private omitUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value
        .filter((entry) => entry !== undefined)
        .map((entry) => this.omitUndefined(entry)) as T;
    }

    if (value && typeof value === 'object') {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        return value;
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [key, this.omitUndefined(entry)])
      ) as T;
    }

    return value;
  }

  list(): Observable<SuperAdminBillingRecord[]> {
    const q = query(this.colRef, orderBy('updatedAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<SuperAdminBillingRecord[]>;
  }

  async create(payload: SuperAdminBillingRecord): Promise<string> {
    const ref = await addDoc(this.colRef, {
      ...this.omitUndefined(payload),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, payload: Partial<SuperAdminBillingRecord>): Promise<void> {
    const ref = doc(this.afs, `billingRecords/${id}`);
    await updateDoc(ref, {
      ...this.omitUndefined(payload),
      updatedAt: serverTimestamp(),
    });
  }
}
