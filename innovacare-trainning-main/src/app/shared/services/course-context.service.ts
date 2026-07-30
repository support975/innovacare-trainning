import { Injectable, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  getDoc,
  collectionData,
  collection,
  query,
  where,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export interface CourseContext {
  courseId?: string;
  courseTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  progressPct?: number;
  lastQuizScore?: number;
  weakTopics?: string[];
  enrollmentStatus?: 'in_progress' | 'completed' | 'assigned';
}

@Injectable({ providedIn: 'root' })
export class CourseContextService {
  private auth = inject(Auth);
  private afs = inject(Firestore);
  private router = inject(Router);

  readonly context = signal<CourseContext>({});

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => this.parseRouteContext((e as NavigationEnd).urlAfterRedirects));
  }

  private parseRouteContext(url: string): void {
    const courseMatch = url.match(/\/courses\/([^/]+)/);
    if (courseMatch) {
      const courseId = courseMatch[1];
      this.loadCourseContext(courseId);
    } else {
      this.context.update((ctx) => ({ ...ctx, courseId: undefined, lessonId: undefined }));
    }
  }

  async loadCourseContext(courseId: string): Promise<void> {
    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) return;

      const [courseSnap, enrollmentSnap] = await Promise.all([
        getDoc(doc(this.afs, 'courses', courseId)),
        getDoc(doc(this.afs, `users/${uid}/enrollments/${courseId}`)),
      ]);

      const courseData = courseSnap.data() as { title?: string } | undefined;
      const enrollData = enrollmentSnap.data() as {
        progressPct?: number;
        score?: number;
        status?: string;
      } | undefined;

      this.context.set({
        courseId,
        courseTitle: courseData?.title,
        progressPct: enrollData?.progressPct,
        lastQuizScore: enrollData?.score,
        enrollmentStatus: enrollData?.status as CourseContext['enrollmentStatus'],
        weakTopics: [],
      });
    } catch {
      // Non-critical — context enrichment is best-effort
    }
  }

  setCourseContext(ctx: Partial<CourseContext>): void {
    this.context.update((prev) => ({ ...prev, ...ctx }));
  }

  clearContext(): void {
    this.context.set({});
  }

  buildContextSummary(): string {
    const ctx = this.context();
    const parts: string[] = [];
    if (ctx.courseTitle) parts.push(`Course: "${ctx.courseTitle}"`);
    if (ctx.progressPct != null) parts.push(`Progress: ${ctx.progressPct}%`);
    if (ctx.lastQuizScore != null) parts.push(`Last quiz score: ${ctx.lastQuizScore}%`);
    if (ctx.weakTopics?.length) parts.push(`Weak areas: ${ctx.weakTopics.join(', ')}`);
    return parts.join(' | ');
  }
}
