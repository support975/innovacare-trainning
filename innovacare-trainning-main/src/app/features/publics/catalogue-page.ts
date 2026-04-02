import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  docData,
  serverTimestamp,
} from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { Course } from '../../data/models';


export interface PathwayRequest {
  courseId: string;
  courseTitle: string;
  source?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CourseCatalogService {
  private readonly firestore = inject(Firestore);

  getPublicActiveCourses(): Observable<Course[]> {
    const ref = collection(this.firestore, 'courses');

    return collectionData(ref, { idField: 'id' }).pipe(
      map((items) => {
        console.log('Firestore courses raw:', items);
        return items as Course[];
      })
    );
  }

  getCourseById(courseId: string): Observable<Course | undefined> {
    const ref = doc(this.firestore, `courses/${courseId}`);
    return docData(ref, { idField: 'id' }).pipe(
      map((item) => item as Course)
    );
  }

  addToPathway(payload: PathwayRequest): Observable<void> {
    const ref = collection(this.firestore, 'pathwayRequests');

    const promise = addDoc(ref, {
      ...payload,
      source: payload.source ?? 'catalog-page',
      status: 'new',
      addedAt: serverTimestamp(),
    }).then(() => void 0);

    return new Observable<void>((subscriber) => {
      promise
        .then(() => {
          subscriber.next();
          subscriber.complete();
        })
        .catch((error) => subscriber.error(error));
    });
  }
}