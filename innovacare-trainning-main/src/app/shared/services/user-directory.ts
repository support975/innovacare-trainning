import { Injectable, inject } from '@angular/core';
import {
  Firestore, doc, docData, setDoc, updateDoc, collection, collectionData,
  addDoc, deleteDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { map, of, switchMap } from 'rxjs';

export interface UserDoc {
  active?: boolean;
  status?: string;
  role?: string;

  displayName?: string;
  email?: string;
  phone?: string;
  address?: string;
  profileImage?: string;

  department?: string;
  title?: string;

  updatedAt?: any;
  // + anything else you already store (birthDate, employementDate, etc.)
}

export interface LicenseDoc {
  id?: string;
  state: string;
  type: string;
  number: string;
  renewalDate?: any;
  renewalPeriodMonths?: number;
  /** Continuing-education hours required for this license's renewal period. */
  hours?: number;
  reminderWeeks?: number;
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class UserDirectoryService {
  private afs = inject(Firestore);
  private auth = inject(Auth);

  private async getUid(): Promise<string | null> {
    const u = this.auth.currentUser;
    if (u) return u.uid;
    return await new Promise(resolve => {
      const unsub = this.auth.onAuthStateChanged(x => { unsub(); resolve(x?.uid ?? null); });
    });
  }

  user$() {
    return of(null).pipe(
      switchMap(async () => await this.getUid()),
      switchMap((uid) => {
        if (!uid) return of<UserDoc | null>(null);
        return docData(doc(this.afs, `users/${uid}`)).pipe(
          map((d: any) => (d ?? null) as UserDoc | null)
        );
      })
    );
  }

  async updateUser(patch: Partial<UserDoc>) {
    const uid = await this.getUid();
    if (!uid) throw new Error('Not authenticated');
    await setDoc(doc(this.afs, `users/${uid}`), {
      ...patch,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  licenses$() {
    return of(null).pipe(
      switchMap(async () => await this.getUid()),
      switchMap((uid) => {
        if (!uid) return of<LicenseDoc[]>([]);
        const colRef = collection(this.afs, `users/${uid}/licenses`);
        return collectionData(colRef, { idField: 'id' }).pipe(
          map((rows: any[]) => (rows ?? []) as LicenseDoc[])
        );
      })
    );
  }

  /** Read another user's licenses (manager/admin same-org, per firestore.rules). */
  licensesForUid$(uid: string) {
    const colRef = collection(this.afs, `users/${uid}/licenses`);
    return collectionData(colRef, { idField: 'id' }).pipe(
      map((rows: any[]) => (rows ?? []) as LicenseDoc[])
    );
  }

  async addLicense(input: Omit<LicenseDoc, 'id'|'createdAt'|'updatedAt'>) {
    const uid = await this.getUid();
    if (!uid) throw new Error('Not authenticated');
    await addDoc(collection(this.afs, `users/${uid}/licenses`), {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async updateLicense(id: string, patch: Partial<LicenseDoc>) {
    const uid = await this.getUid();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.afs, `users/${uid}/licenses/${id}`), {
      ...patch,
      updatedAt: serverTimestamp(),
    } as any);
  }

  async deleteLicense(id: string) {
    const uid = await this.getUid();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.afs, `users/${uid}/licenses/${id}`));
  }
}
