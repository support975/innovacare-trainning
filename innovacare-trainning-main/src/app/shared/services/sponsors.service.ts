import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  DocumentReference,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Sponsor } from '../../data/models';

@Injectable({ providedIn: 'root' })
export class SponsorsService {
  private firestore = inject(Firestore);
  private sponsorCollection = collection(this.firestore, 'sponsors');

  listByOrg(ownerOrgId: string): Observable<Sponsor[]> {
    const q = query(this.sponsorCollection, where('ownerOrgId', '==', ownerOrgId), orderBy('name', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<Sponsor[]>;
  }

  getById(id: string): Observable<Sponsor | undefined> {
    const ref = doc(this.firestore, `sponsors/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Sponsor | undefined>;
  }

  async create(sponsor: Omit<Sponsor, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.sponsorCollection, {
      ...sponsor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, changes: Partial<Sponsor>): Promise<void> {
    const ref = doc(this.firestore, `sponsors/${id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `sponsors/${id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }
}
