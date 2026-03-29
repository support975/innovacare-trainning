import { inject, Injectable } from '@angular/core';
import { collectionData, docData } from '@angular/fire/firestore';
import { Firestore, collection, doc } from 'firebase/firestore';
import { Observable } from 'rxjs';
export interface CourseSection { id: string; title: string; type: 'text'|'video'|'audio'; content?: string; url?: string; }
export interface Course {
  id: string;
  title: string;
  description: string;
  lang: string;
  durationMin: number;
  sections: CourseSection[];
}
@Injectable({
  providedIn: 'root'
})
export class Course {
  private afs = inject(Firestore);

  list(): Observable<Course[]> {
    const ref = collection(this.afs, 'courses');
    return collectionData(ref, { idField: 'id' }) as Observable<Course[]>;
  }

  byId(id: string): Observable<Course> {
    const ref = doc(this.afs, 'courses', id);
    return docData(ref, { idField: 'id' }) as Observable<Course>;
  }
}