import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  DocumentReference,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Accreditation } from '../../data/models';

@Injectable({ providedIn: 'root' })
export class AccreditationService {
  private firestore = inject(Firestore);
  private accreditationsCollection = collection(this.firestore, 'accreditations');

  listByOrg(ownerOrgId: string): Observable<Accreditation[]> {
    const q = query(
      this.accreditationsCollection,
      where('ownerOrgId', '==', ownerOrgId),
      orderBy('accreditingOrganization', 'asc'),
    );
    return collectionData(q, { idField: 'id' }) as Observable<Accreditation[]>;
  }

  getById(id: string): Observable<Accreditation | undefined> {
    const ref = doc(this.firestore, `accreditations/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Accreditation | undefined>;
  }

  async create(accreditation: Omit<Accreditation, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.accreditationsCollection, {
      ...accreditation,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, changes: Partial<Accreditation>): Promise<void> {
    const ref = doc(this.firestore, `accreditations/${id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `accreditations/${id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }
}
