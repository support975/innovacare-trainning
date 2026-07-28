import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData,
  addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
  DocumentReference,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Faculty } from '../../data/models';

@Injectable({ providedIn: 'root' })
export class FacultyService {
  private firestore = inject(Firestore);
  private facultyCollection = collection(this.firestore, 'faculty');

  listByOrg(ownerOrgId: string): Observable<Faculty[]> {
    const q = query(this.facultyCollection, where('ownerOrgId', '==', ownerOrgId), orderBy('name', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<Faculty[]>;
  }

  getById(id: string): Observable<Faculty | undefined> {
    const ref = doc(this.firestore, `faculty/${id}`);
    return docData(ref, { idField: 'id' }) as Observable<Faculty | undefined>;
  }

  async create(faculty: Omit<Faculty, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(this.facultyCollection, {
      ...faculty,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, changes: Partial<Faculty>): Promise<void> {
    const ref = doc(this.firestore, `faculty/${id}`);
    await updateDoc(ref as unknown as DocumentReference, {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    const ref = doc(this.firestore, `faculty/${id}`);
    await deleteDoc(ref as unknown as DocumentReference);
  }
}
