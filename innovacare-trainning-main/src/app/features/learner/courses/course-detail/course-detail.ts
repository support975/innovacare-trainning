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
export type OrgType = 'health' | 'IT' | 'school';

export interface HealthMeta {
  healthCareType: 'SNF' | 'HomeHealth' | 'Hospice' | 'Hospital' | 'PrivatePractice' | 'PHCP';
}

export interface Course {
  id?: string;
  code?: string;
  title: string;
  subtitle?: string;
  description: string;
  lang: Lang;
  durationMin: number;
  ceCredit?: number;
  active: boolean;
  kind: 'Course' | 'Text' | 'Module';
  type: 'It' | 'Health' | 'Hr' | 'safety';

  tags?: string[];
  url?: string;
  imageUrl?: string;

  lecturer: string;
  disclosures: string[];
  targetAudience: string[];
  prerequisites: string[];
  requirements: string[];
  accomodations: string;

  orgId?: string | null;
  orgType?: OrgType;
  healthMeta?: HealthMeta;

  releaseAt?: any;
  publishedAt?: any;
  isPublic?: boolean;
  passingScore: number;
  lockedSequence: boolean;
  exipirationDate?: any;
  confirmAt?: any;
  confirmBy?: string;
  confirmMessage?: string;

  sections?: Array<{
    id: string;
    title: string;
    order: number;
    estMin?: number;
    lessons: Array<{
      id: string;
      title: string;
      estMin?: number;
      order: number;
      blocks: Array<any>;
    }>;
  }>;
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
  private uid$ = authState(this.auth).pipe(map((u) => u?.uid ?? null));

  notice = '';
  busy = false;

  readonly courseId: string = this.route.snapshot.paramMap.get('id') ?? '';

  enrollment = toSignal(
    this.uid$.pipe(
      switchMap((uid) =>
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
        ceCredit: 0,
        active: true,
        kind: 'Course',
        type: 'Health',
        tags: [],
        url: '',
        imageUrl: '',
        lecturer: '',
        disclosures: [],
        targetAudience: [],
        prerequisites: [],
        requirements: [],
        accomodations: '',
        passingScore: 80,
        lockedSequence: false,
        isPublic: false,
        sections: [],
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

  isExternalCourseUrl(u?: string | null): boolean {
    const raw = (u || '').trim();
    if (!raw) return false;
    try {
      const parsed = new URL(raw, window.location.origin);
      return /^https?:$/.test(parsed.protocol) && parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  formatDate(v: any): string {
    if (!v) return '—';

    try {
      if (typeof v?.toDate === 'function') {
        return v.toDate().toLocaleDateString();
      }
      const d = new Date(v);
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    } catch {
      return '—';
    }
  }

  totalSections(): number {
    return Array.isArray(this.course().sections) ? this.course().sections!.length : 0;
  }

  totalLessons(): number {
    const sections = this.course().sections ?? [];
    return sections.reduce((sum, s) => sum + (Array.isArray(s.lessons) ? s.lessons.length : 0), 0);
  }

  totalBlocks(): number {
    const sections = this.course().sections ?? [];
    return sections.reduce(
      (sum, s) =>
        sum +
        (s.lessons ?? []).reduce(
          (lessonSum, l) => lessonSum + (Array.isArray(l.blocks) ? l.blocks.length : 0),
          0
        ),
      0
    );
  }

  hasAudienceData(): boolean {
    const c = this.course();
    return !!(
      c.targetAudience?.length ||
      c.prerequisites?.length ||
      c.requirements?.length ||
      c.accomodations
    );
  }

  hasPublicationData(): boolean {
    const c = this.course();
    return !!(
      c.releaseAt ||
      c.publishedAt ||
      c.exipirationDate ||
      c.confirmAt ||
      c.confirmBy ||
      c.confirmMessage
    );
  }

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

    try {
      await this.enrollSvc.tryMarkStarted(user.uid, this.courseId);
    } catch {}

    const base = (this.course().url || '').trim();

    if (this.isExternalCourseUrl(base)) {
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