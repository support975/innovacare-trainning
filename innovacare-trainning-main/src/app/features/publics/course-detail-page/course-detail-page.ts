import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CourseCatalogService } from '../catalogue-page';
import { Course } from '../../../data/models';


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
  ],
  templateUrl: './course-detail-page.html',
  styleUrl: './course-detail-page.css',
})
export class CourseDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly courseService = inject(CourseCatalogService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
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
}