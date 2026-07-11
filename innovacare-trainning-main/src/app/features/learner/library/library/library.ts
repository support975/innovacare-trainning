import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CoursesRepo } from '../../../../data/courses.repo';
import { Course } from '../../../../data/models';
import { AuthService } from '../../../../core/auth';
import { toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';


@Component({
  selector: 'learner-library',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './library.html',
  styleUrl: './library.css'
})
export class Library {
  private repo = inject(CoursesRepo);
  private router = inject(Router);
  private auth = inject(AuthService);

  private list = toSignal(
    this.auth.profile$.pipe(
      switchMap(profile => profile ? this.repo.visibleForProfile(profile) : of([] as Course[]))
    ),
    { initialValue: [] as Course[] }
  );

  // UI state
  query = signal('');
  lang = signal<'all'|'en'|'fr'|'es'>('all');

  // derived view
  view = computed(() => {
    const q = this.query().trim().toLowerCase();
    const lg = this.lang();
    return this.list()
      .filter(c => (lg === 'all'))
      .filter(c => !q ? true :
        c.title.toLowerCase().includes(q) ||
        (c.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
        (c.description ?? '').toLowerCase().includes(q));
  });

  open(c: Course) { this.router.navigate(['/learner/courses', c.id]); }
  // If you're using Angular signals:
showCount = signal(5);
trackById = (_: number, c: { id?: string }) => c.id ?? _;


}
