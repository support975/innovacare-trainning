import { computed, inject, Injectable, Signal } from '@angular/core';
import { addDoc, getDoc, setDoc } from '@angular/fire/firestore';
import {  doc, updateDoc, deleteDoc, serverTimestamp } from '@angular/fire/firestore';
import {
  Firestore, collection, collectionData, query, where, orderBy
} from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { Course } from './models';

@Injectable({ providedIn: 'root' })
export class CoursesRepo {
  private fs = inject(Firestore);
  private col = collection(this.fs, 'courses');
  private courses$ = collectionData(this.col, { idField: 'id' }) as Observable<Course[]>;
  private _all: Signal<Course[]> = toSignal(
    collectionData(this.col, { idField: 'id' }) as Observable<Course[]>,
    { initialValue: [] }
  );

  readonly courses: Signal<Course[]> = toSignal(this.courses$, { initialValue: [] });

  allActive(): Signal<Course[]> {
    const q = query(this.col, where('active', '==', true), orderBy('title'));

    // Strongly type the observable
    const stream = collectionData(q, { idField: 'id' }) as Observable<Course[]>;

    // toSignal may be typed as Signal<Course[] | undefined> in your env
    const raw = toSignal(stream) as unknown as Signal<Course[] | undefined>;

    // ✅ Always return Signal<Course[]> (no undefined)
    return computed(() => raw() ?? []);
  }

  add(course: Omit<Course, 'id'|'createdAt'|'updatedAt'>) {
    return addDoc(this.col, {
      ...course,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  update(id: string, patch: Partial<Course>) {
    return updateDoc(doc(this.fs, 'courses', id), { ...patch, updatedAt: serverTimestamp() });
  }

  remove(id: string) {
    return deleteDoc(doc(this.fs, 'courses', id));
  }

  all(): Signal<Course[]> {
    return this._all;
  }

  getOne(courseId: string) {
    return doc(this.fs, 'courses', courseId);
  }
  
  async load(courseId: string): Promise<Course | null> {
    const snap = await getDoc(this.getOne(courseId));
    return snap.exists() ? (snap.data() as Course) : null;
  }
  async create(course: Course) {
    const ref = doc(collection(this.fs, 'courses'));
    await setDoc(ref, { ...course, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return ref.id;
  }
  
  

}
