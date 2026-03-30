import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { SuperAdminUser, UserRole } from '../models/super-admin.models';


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
}