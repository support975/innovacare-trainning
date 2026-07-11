import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  docData,
  setDoc,
  query,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { map, Observable } from 'rxjs';
import { Course } from '../../data/models';


export interface PathwayRequest {
  courseId: string;
  courseTitle: string;
  source?: string;
}

export interface CourseAccessRequestCreate {
  courseId: string;
  courseTitle?: string;
  source?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CourseCatalogService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  getPublicActiveCourses(): Observable<Course[]> {
    const ref = collection(this.firestore, 'courses');
    const publicCoursesQuery = query(
      ref,
      where('active', '==', true),
      where('isPublic', '==', true)
    );

    return collectionData(publicCoursesQuery, { idField: 'id' }).pipe(
      map((items) => items as Course[])
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

  async requestOrganizationCourseAccess(payload: CourseAccessRequestCreate): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('Please sign in first.');

    const courseId = payload.courseId.trim();
    if (!courseId) throw new Error('Missing course id.');

    const requestId = `${user.uid}_${courseId}`.replace(/[^\w-]/g, '_');
    const ref = doc(this.firestore, `courseAccessRequests/${requestId}`);

    await setDoc(
      ref,
      {
        uid: user.uid,
        userEmail: user.email ?? '',
        userName: user.displayName ?? '',
        courseId,
        ...(payload.courseTitle ? { courseTitle: payload.courseTitle } : {}),
        status: 'pending_approval',
        paymentStatus: 'not_started',
        source: payload.source ?? 'public-course-request',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  }
}
