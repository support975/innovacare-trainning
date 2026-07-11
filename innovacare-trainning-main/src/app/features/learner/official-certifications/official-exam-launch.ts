import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CertificationService } from '../../../shared/certification-authority/certification.service';
import { CertificationSessionService } from '../../../shared/certification-authority/certification-session.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';

@Component({
  selector: 'app-official-exam-launch',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="launch-page">
      <section class="panel">
        <div class="badge">Official Exam</div>
        <h1>{{ title() }}</h1>
        <p>{{ message() }}</p>
        <div class="actions">
          <button class="btn-primary" type="button" (click)="launch()" [disabled]="!ready()">
            Continue to exam
          </button>
          <a class="btn-ghost" routerLink="/learner/official-certifications">Back to applications</a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .launch-page{min-height:60vh;display:grid;place-items:center;padding:2rem;color:#1a2b4a}.panel{width:min(680px,100%);background:#fff;border:1px solid #e4ecf7;border-radius:16px;padding:2rem;box-shadow:0 8px 24px rgba(26,63,111,.08)}
    .badge{display:inline-flex;padding:.35rem .7rem;border-radius:999px;background:#e8f5f5;color:#00797a;border:1px solid #9ae6d6;font-size:.76rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
    h1{margin:1rem 0 .5rem;color:#1a3f6f;font-size:clamp(1.5rem,4vw,2rem)}p{margin:0;color:#5a6a7e;line-height:1.6}.actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1.5rem}
    .btn-primary,.btn-ghost{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:8px;padding:.65rem 1rem;font-weight:900;text-decoration:none;cursor:pointer}.btn-primary{border:0;background:#1a3f6f;color:#fff}.btn-primary:disabled{opacity:.55;cursor:not-allowed}.btn-ghost{border:1px solid #d6e0ee;background:#fff;color:#1a3f6f}
  `],
})
export class OfficialExamLaunchComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly applications = inject(CandidateApplicationService);
  private readonly sessions = inject(CertificationSessionService);
  private readonly certifications = inject(CertificationService);
  private readonly blueprints = inject(ExamBlueprintService);

  readonly title = signal('Preparing official exam');
  readonly message = signal('Checking your candidate application and exam eligibility.');
  readonly ready = signal(false);
  private applicationId = '';
  private sessionId = '';
  private courseId = '';
  private examId = '';
  private blueprintId = '';

  async ngOnInit(): Promise<void> {
    this.applicationId = this.route.snapshot.paramMap.get('applicationId') || '';
    if (!this.applicationId) {
      this.fail('Application not found.');
      return;
    }

    try {
      const application = await this.applications.getApplication(this.applicationId);
      if (!application) {
        this.fail('Application not found.');
        return;
      }
      if (!['eligible', 'approved_for_exam'].includes(application.status)) {
        this.fail('This application is not approved for exam access yet.');
        return;
      }

      const session = await this.sessions.getSession(application.sessionId);
      if (!session) {
        this.fail('Certification session not found.');
        return;
      }
      this.sessionId = session.id || application.sessionId;

      // Prefer a published exam blueprint created for this session (Exam Blueprint Center).
      const blueprint = await this.blueprints.getPublishedBlueprintForSession(this.sessionId);
      if (blueprint?.id) {
        this.blueprintId = blueprint.id;
        this.title.set(session.name);
        this.message.set('Your application is approved. Continue when you are ready to start the official exam.');
        this.ready.set(true);
        return;
      }

      // Fall back to the legacy course exam engine if the session/certification links to one.
      const certification = await this.certifications.getCertification(session.certificationId);
      const courseId = (session.linkedCourseIds || [])[0] || (certification?.linkedCourseIds || [])[0] || '';
      const examId = (session.linkedExamIds || [])[0] || (certification?.linkedExamIds || [])[0] || '';
      if (!courseId || !examId) {
        this.fail('This session is not linked to an exam yet.');
        return;
      }

      this.courseId = courseId;
      this.examId = examId;
      this.title.set(session.name);
      this.message.set('Your application is approved. Continue when you are ready to start the official exam.');
      this.ready.set(true);
    } catch (err: any) {
      this.fail(err?.message || 'Unable to prepare official exam.');
    }
  }

  launch(): void {
    if (!this.ready()) return;

    if (this.blueprintId) {
      this.router.navigate(
        ['/learner/official-certifications', this.applicationId, 'blueprint-exam', this.blueprintId]
      );
      return;
    }

    this.router.navigate(['/learner/courses', this.courseId, 'exam', this.examId], {
      queryParams: {
        officialApplicationId: this.applicationId,
        certificationSessionId: this.sessionId,
      },
    });
  }

  private fail(message: string): void {
    this.title.set('Official exam unavailable');
    this.message.set(message);
    this.ready.set(false);
  }
}
