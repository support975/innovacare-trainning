import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
import { AuthService } from '../../../core/auth';

@Component({
  selector: 'app-exam-reinscription',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './exam-reinscription.html',
  styleUrls: ['./exam-reinscription.css'],
})
export class ExamReinscriptionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private authSvc = inject(AuthService);

  examId = '';
  exam = signal<any | null>(null);
  blueprint = signal<any | null>(null);
  renewalCourses = signal<any[]>([]);
  learnerEnrollments = signal<any[]>([]);

  loading = signal(true);
  error = signal('');

  currentUser = this.authSvc.profile$;
  userId = '';

  ngOnInit(): void {
    this.examId = this.route.snapshot.queryParamMap.get('examId') || '';
    if (!this.examId) {
      this.error.set('Missing exam ID.');
      this.loading.set(false);
      return;
    }

    this.currentUser.subscribe((profile) => {
      if (profile?.uid) {
        this.userId = profile.uid;
        this.loadReinscriptionInfo();
      }
    });
  }

  private async loadReinscriptionInfo(): Promise<void> {
    try {
      // Load exam blueprint
      const blueprintRef = doc(this.afs, `examBlueprints/${this.examId}`);
      const blueprintSnap = await getDoc(blueprintRef);

      if (!blueprintSnap.exists()) {
        this.error.set('Exam not found.');
        this.loading.set(false);
        return;
      }

      const blueprintData = blueprintSnap.data();
      this.blueprint.set(blueprintData);

      // Load renewal courses
      const renewalCourseIds = blueprintData['renewalCourseIds'] || [];
      if (renewalCourseIds.length > 0) {
        for (const courseId of renewalCourseIds) {
          const courseRef = doc(this.afs, `courses/${courseId}`);
          const courseSnap = await getDoc(courseRef);
          if (courseSnap.exists()) {
            this.renewalCourses.update((courses) => [
              ...courses,
              { id: courseSnap.id, ...courseSnap.data() },
            ]);
          }
        }
      }

      // Load learner's course enrollments
      const enrollmentsQuery = query(
        collection(this.afs, `users/${this.userId}/enrollments`),
        where('status', 'in', ['assigned', 'started', 'completed'])
      );
      const enrollmentsSnap = await getDocs(enrollmentsQuery);
      const enrollments: any[] = [];
      for (const snap of enrollmentsSnap.docs) {
        enrollments.push({
          id: snap.id,
          ...snap.data(),
        });
      }
      this.learnerEnrollments.set(enrollments);
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load re-inscription info.');
    } finally {
      this.loading.set(false);
    }
  }

  isEnrolledInCourse(courseId: string): boolean {
    return this.learnerEnrollments().some((e) => e.courseId === courseId);
  }

  getEnrollmentStatus(courseId: string): string {
    const enrollment = this.learnerEnrollments().find((e) => e.courseId === courseId);
    return enrollment?.status || 'not-enrolled';
  }

  startCourse(courseId: string): void {
    this.router.navigate(['/learner/courses', courseId]);
  }

  scheduleRetake(): void {
    this.router.navigate(['/kiosk'], {
      queryParams: { examId: this.examId },
    });
  }

  backToDashboard(): void {
    this.router.navigate(['/learner/dashboard']);
  }
}
