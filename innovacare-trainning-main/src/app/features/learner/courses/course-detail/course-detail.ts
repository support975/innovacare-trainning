import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Firestore, doc, docData, collection, collectionData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom, map, of, switchMap } from 'rxjs';
import { Auth, authState } from '@angular/fire/auth';
import { EnrollmentService } from '../../../../shared/services/enrollement';

/** ---- Models ---- */
export type Lang = 'EN' | 'FR' | 'ES';

export interface Course {
  id?: string;
  code?: string;
  title: string;
  subtitle?: string;
  description: string;
  lang: Lang;
  durationMin: number;
  active: boolean;
  kind: 'Course' | 'Text' | 'Module';
  tags?: string[];
  url?: string;        // external provider URL (optional)
  imageUrl?: string;
}

export interface Certification {
  id: string;
  code: string;
  name: string;
  credit: string;
}

export interface Exam {
  id: string;
  title: string;
  questions: number;
  available: boolean;
  passPct?: number;
}

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-detail.html',
  styleUrls: ['./course-detail.css'],
})
export class CourseDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private enrollSvc = inject(EnrollmentService);
  private auth = inject(Auth);
  private uid$ = authState(this.auth).pipe(map(u => u?.uid ?? null));

  notice = '';
  busy = false;

  // Course id from route
  readonly courseId: string = this.route.snapshot.paramMap.get('id') ?? '';

  enrollment = toSignal(
    this.uid$.pipe(
      switchMap(uid =>
        uid
          ? docData(doc(this.afs, `users/${uid}/enrollments/${this.courseId}`), { idField: 'id' })
          : of(null)
      )
    ),
    { initialValue: null as any }
  );

  course = toSignal(
    docData(doc(this.afs, `courses/${this.courseId}`), { idField: 'id' }) as Observable<Course>,
    {
      initialValue: {
        id: this.courseId,
        code: '',
        title: '',
        subtitle: '',
        description: '',
        lang: 'EN',
        durationMin: 0,
        active: true,
        kind: 'Course',
        tags: [],
        url: '',
        imageUrl: '',
      },
    }
  );

  certs = toSignal(
    collectionData(collection(this.afs, `courses/${this.courseId}/certifications`), {
      idField: 'id',
    }) as Observable<Certification[]>,
    { initialValue: [] }
  );

  exams = toSignal(
    collectionData(collection(this.afs, `courses/${this.courseId}/exams`), {
      idField: 'id',
    }) as Observable<Exam[]>,
    { initialValue: [] }
  );

  /** Determine if a course URL is a true external provider link */
  isExternalCourseUrl(u?: string | null): boolean {
    const raw = (u || '').trim();
    if (!raw) return false;
    try {
      const parsed = new URL(raw, window.location.origin);
      // External only if absolute http(s) and not same-origin
      return /^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin;
    } catch {
      // Invalid or relative => treat as internal (use local player)
      return false;
    }
  }

  /** ---- Actions ---- */
  async startCourse(): Promise<void> {
    this.notice = '';

    const user = await firstValueFrom(authState(this.auth));
    if (!user) {
      this.notice = 'Please sign in first.';
      return;
    }

    const enr: any = await this.enrollSvc.getEnrollment(user.uid, this.courseId);
    if (!enr) {
      this.notice = 'Enrollment not found. Assign the course to your account first.';
      return;
    }
    if (!['assigned', 'started'].includes(enr.status)) {
      this.notice = `You cannot start this course while status is "${enr.status}".`;
      return;
    }
    if (this.enrollSvc.isOverdue(enr)) {
      this.notice = 'This course is overdue. Please contact support to extend your deadline.';
      return;
    }

    // Best-effort mark as started (idempotent)
    try { await this.enrollSvc.tryMarkStarted(user.uid, this.courseId); } catch {}

    const base = (this.course().url || '').trim();

    if (this.isExternalCourseUrl(base)) {
      // External provider flow with return URL back to app
      const ticketId = await this.enrollSvc.issueLaunchTicket(user.uid, this.courseId);
      const origin = window.location.origin;
      const returnPath = this.router
        .createUrlTree(['/learner/courses', this.courseId, 'return'], {
          queryParams: { t: ticketId, e: 'complete', s: Date.now() },
        })
        .toString();

      const finalUrl =
        `${base}${base.includes('?') ? '&' : '?'}return=${encodeURIComponent(origin + returnPath)}`;

      const win = window.open(finalUrl, '_blank', 'noopener');
      if (!win) window.location.href = finalUrl;
      return;
    }

    // No (valid) external URL => open local CoursePlayer
    this.router.navigate(['/learner/courses', this.courseId, 'view']);
  }

  openLocalPlayer(ev?: Event): void {
    ev?.preventDefault();
    this.router.navigate(['/learner/courses', this.courseId, 'view']);
  }

  takeExam(examId?: string): void {
    const first = examId ?? this.exams()[0]?.id;
    if (first) this.router.navigate(['/learner/courses', this.courseId, 'exam', first]);
  }

  async assignToMe(courseId: string): Promise<void> {
    this.notice = '';
    this.busy = true;
    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) {
        this.notice = 'Please sign in first.';
        return;
      }
      await this.enrollSvc.ensureEnrollment(user.uid, courseId, 'self');
      this.notice = 'Course assigned to your account.';
    } catch (e: any) {
      console.error('Enrollment write failed:', e);
      this.notice = e?.message || 'Failed to assign course.';
    } finally {
      this.busy = false;
    }
  }

  isOverdueNow(): boolean {
    const enr: any = this.enrollment();
    return this.enrollSvc.isOverdue(enr);
  }
}
