import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CourseCatalogService } from '../catalogue-page';
import { Course } from '../../../data/models';
import { AuthService } from '../../../core/auth';
import { EnrollmentService } from '../../../shared/services/enrollement';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';


@Component({
  selector: 'app-course-detail-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    PublicTranslateDirective,
  ],
  templateUrl: './course-detail-page.html',
  styleUrl: './course-detail-page.css',
})
export class CourseDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseService = inject(CourseCatalogService);
  private readonly auth = inject(AuthService);
  private readonly enrollment = inject(EnrollmentService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly starting = signal(false);
  readonly accessRequesting = signal(false);
  readonly requestedCourseId = signal<string | null>(null);
  readonly course = signal<Course | null>(null);

  readonly totalLessons = computed(() =>
    (this.course()?.sections ?? []).reduce(
      (sum, section) => sum + (section.lessons?.length ?? 0),
      0
    )
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const courseId = params.get('id');
      this.requestedCourseId.set(courseId);
      this.loading.set(true);
      this.course.set(null);
      if (!courseId) {
        this.loading.set(false);
        return;
      }

      this.courseService
        .getCourseById(courseId)
        .pipe(takeUntilDestroyed())
        .subscribe({
          next: (course) => {
            this.course.set(course ?? null);
            this.loading.set(false);
          },
          error: (error) => {
            console.error('Erreur chargement détail cours', error);
            this.course.set(null);
            this.loading.set(false);
            this.snackBar.open('Impossible de charger ce cours.', 'Fermer', {
              duration: 5000,
            });
          },
        });
    });
  }

  addToPathway(): void {
    const course = this.course();
    if (!course?.id) return;

    this.courseService
      .addToPathway({
        courseId: course.id,
        courseTitle: course.title,
        source: 'course-detail-page',
      })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          this.snackBar.open(
            `"${course.title}" ajouté au parcours.`,
            'Fermer',
            { duration: 4000 }
          );
        },
        error: (error) => {
          console.error('Erreur addToPathway detail', error);
          this.snackBar.open(
            'Impossible d’ajouter ce cours au parcours.',
            'Fermer',
            { duration: 5000 }
          );
        },
      });
  }

  async startCourse(): Promise<void> {
    const course = this.course();
    if (!course?.id || this.starting()) return;

    const uid = this.auth.currentUid;
    if (!uid) {
      await this.router.navigate(['/signup'], {
        queryParams: { courseId: course.id },
      });
      return;
    }

    this.starting.set(true);
    try {
      await this.enrollment.ensureEnrollment(uid, course.id, 'self');
      await this.router.navigate(['/learner/courses', course.id]);
    } catch (error) {
      console.error('Erreur démarrage cours public', error);
      this.snackBar.open(
        'Ce cours nécessite un accès organisation ou n’est pas disponible en accès public.',
        'Fermer',
        { duration: 6000 }
      );
    } finally {
      this.starting.set(false);
    }
  }

  async requestOrganizationCourseAccess(courseId = this.requestedCourseId()): Promise<void> {
    if (!courseId || this.accessRequesting()) return;

    const uid = this.auth.currentUid;
    if (!uid) {
      await this.router.navigate(['/signup'], {
        queryParams: { courseId, requestAccess: '1' },
      });
      return;
    }

    this.accessRequesting.set(true);
    try {
      await this.courseService.requestOrganizationCourseAccess({
        courseId,
        courseTitle: this.course()?.title,
        source: 'course-detail-page',
      });
      this.snackBar.open(
        'Access request submitted. Admin approval and payment are required before this course opens.',
        'Fermer',
        { duration: 6000 }
      );
      await this.router.navigate(['/learner/assignments']);
    } catch (error) {
      console.error('Erreur demande accès cours organisation', error);
      this.snackBar.open(
        'Request already exists or this course is not available for individual access.',
        'Fermer',
        { duration: 6000 }
      );
    } finally {
      this.accessRequesting.set(false);
    }
  }
}
