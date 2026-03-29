// features/learner/courses/return/return.component.ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, authState } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { EnrollmentService } from '../../../shared/services/enrollement';


@Component({
  selector: 'app-course-return',
  standalone: true,
  template: `
    <div class="page">
      <h2>{{ title }}</h2>
      <p class="muted">{{ msg }}</p>
      <button class="btn" (click)="goBack()">Back to Library</button>
    </div>
  `
})
export class CourseReturnComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(Auth);
  private enrollSvc = inject(EnrollmentService);

  title = 'Processing course status…';
  msg = 'Please wait.';

  async ngOnInit() {
    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) throw new Error('Please sign in.');

      const courseId = this.route.snapshot.paramMap.get('id')!;
      const ticketId = this.route.snapshot.queryParamMap.get('t') || '';
      const event = this.route.snapshot.queryParamMap.get('e') || 'complete'; // default

      if (!ticketId) throw new Error('Missing ticket.');

      const res = await this.enrollSvc.redeemTicket(user.uid, ticketId);
      if (!res.ok || res.courseId !== courseId) throw new Error('Invalid or expired ticket.');

      if (event === 'complete') {
        await this.enrollSvc.markCompleted(user.uid, courseId);
        this.title = 'Course completed!';
        this.msg = 'Your completion was recorded.';
      } else if (event === 'start') {
        await this.enrollSvc.tryMarkStarted(user.uid, courseId);
        this.title = 'Course started!';
        this.msg = 'Your start was recorded.';
      } else {
        this.title = 'Return processed';
        this.msg = 'Nothing to record for this event.';
      }
    } catch (e: any) {
      this.title = 'Could not record status';
      this.msg = e?.message || 'Unknown error.';
    }
  }

  goBack() { this.router.navigate(['/learner/library']); }
}
