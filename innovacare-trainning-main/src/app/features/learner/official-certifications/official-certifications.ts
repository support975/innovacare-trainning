import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import {
  CandidateApplication,
  CertificationSession,
  EducationPath,
} from '../../../shared/certification-authority/certification.models';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CertificationSessionService } from '../../../shared/certification-authority/certification-session.service';
import { CertificationDocumentService } from '../../../shared/certification-authority/certification-document.service';

type ApplicationForm = {
  sessionId: string;
  educationPath: EducationPath;
};

type DocumentForm = {
  applicationId: string;
  type: 'diploma' | 'transcript' | 'license' | 'identity' | 'work_experience' | 'payment_proof' | 'other';
  fileUrl: string;
};

@Component({
  selector: 'app-learner-official-certifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="official-page">
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Learner · Official Certifications</div>
          <h1 class="page-title">Official Certification Applications</h1>
          <p class="page-sub">
            Apply to open official certification sessions, upload supporting document links and follow eligibility status.
          </p>
        </div>
      </header>

      <section class="notice" [class.notice--error]="error()" *ngIf="notice()">{{ notice() }}</section>

      <section class="grid">
        <article class="panel">
          <div class="panel-head">
            <h2>Open Sessions</h2>
            <p>Select a session and submit a candidate application.</p>
          </div>
          <form class="form" (ngSubmit)="createApplication()">
            <label class="field">
              <span>Certification session</span>
              <select name="sessionId" [(ngModel)]="form.sessionId" required>
                <option value="">Select open session</option>
                <option *ngFor="let session of openSessions()" [value]="session.id">
                  {{ session.name }} · {{ session.examMode }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Education path</span>
              <select name="educationPath" [(ngModel)]="form.educationPath">
                <option value="MINSANTE">MINSANTE</option>
                <option value="MINESUP">MINESUP</option>
                <option value="FORMATION_PROFESSIONNELLE">FORMATION PROFESSIONNELLE</option>
                <option value="INTERNATIONAL">INTERNATIONAL</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>

            <button class="btn-primary" type="submit" [disabled]="busy() || !form.sessionId">
              {{ busy() ? 'Submitting...' : 'Create application' }}
            </button>
          </form>
        </article>

        <article class="panel">
          <div class="panel-head">
            <h2>Add Document Link</h2>
            <p>Phase 2 stores secure document URLs. File upload storage can be added later.</p>
          </div>
          <form class="form" (ngSubmit)="addDocument()">
            <label class="field">
              <span>Application</span>
              <select name="documentApplicationId" [(ngModel)]="docForm.applicationId" required>
                <option value="">Select application</option>
                <option *ngFor="let app of applications()" [value]="app.id">
                  {{ sessionName(app.sessionId) }} · {{ statusLabel(app.status) }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>Document type</span>
              <select name="documentType" [(ngModel)]="docForm.type">
                <option value="identity">Identity</option>
                <option value="diploma">Diploma</option>
                <option value="transcript">Transcript</option>
                <option value="license">License</option>
                <option value="work_experience">Work experience</option>
                <option value="payment_proof">Payment proof</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label class="field">
              <span>Secure file URL</span>
              <input name="fileUrl" [(ngModel)]="docForm.fileUrl" placeholder="https://..." required />
            </label>

            <button class="btn-primary" type="submit" [disabled]="busy() || !docForm.applicationId || !docForm.fileUrl">
              Add document
            </button>
          </form>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>My Applications</h2>
          <p>Internal reviewer notes are not shown here. Final results appear only after publication.</p>
        </div>

        <div class="application-list" *ngIf="applications().length; else empty">
          <article class="application-card" *ngFor="let app of applications()">
            <div class="application-card__top">
              <div>
                <strong>{{ sessionName(app.sessionId) }}</strong>
                <p>{{ app.educationPath }}</p>
              </div>
              <span class="pill" [class.pill--ok]="canStartExam(app)" [class.pill--warn]="app.status === 'missing_documents'">
                {{ statusLabel(app.status) }}
              </span>
            </div>
            <div class="application-actions">
              <a
                class="btn-ghost"
                [routerLink]="['/learner/certification-candidate', app.id]">
                Manage documents &amp; payment
              </a>
              <button class="btn-ghost" type="button" (click)="submitApplication(app)" [disabled]="busy() || app.status !== 'draft'">
                Submit for review
              </button>
              <a
                class="btn-primary"
                *ngIf="canStartExam(app)"
                [routerLink]="['/learner/official-certifications', app.id, 'exam']">
                Start official exam
              </a>
            </div>
          </article>
        </div>

        <ng-template #empty>
          <div class="empty-state">
            <h2>No applications yet</h2>
            <p>Choose an open official certification session to begin.</p>
          </div>
        </ng-template>
      </section>
    </div>
  `,
  styles: [`
    .official-page{display:grid;gap:1.5rem;padding:1.75rem 2rem;max-width:1180px;margin:0 auto;color:#1a2b4a}
    .page-header{padding-bottom:1.25rem;border-bottom:1px solid #e4ecf7}.page-eyebrow{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#00a79d;margin-bottom:.35rem}
    .page-title{margin:0;font-size:clamp(1.5rem,3vw,2rem);font-weight:900;color:#1a3f6f}.page-sub{margin:.35rem 0 0;color:#5a6a7e;font-size:.9rem;line-height:1.5}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.panel{background:#fff;border:1px solid #e4ecf7;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .panel-head{padding:1.1rem 1.25rem;border-bottom:1px solid #f0f4fb;background:#fbfcff}.panel-head h2{margin:0;font-size:1rem;color:#1a3f6f}.panel-head p{margin:.25rem 0 0;color:#5a6a7e;font-size:.82rem;line-height:1.45}
    .form{display:grid;gap:.9rem;padding:1.2rem}.field{display:grid;gap:.35rem}.field span{font-size:.78rem;font-weight:800}.field input,.field select{width:100%;border:1.5px solid #d6e0ee;border-radius:8px;padding:.62rem .75rem;font:inherit;font-size:.88rem;color:#1a2b4a;background:#fff}
    .btn-primary,.btn-ghost{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:8px;padding:.6rem 1rem;font-weight:900;text-decoration:none;cursor:pointer}.btn-primary{border:0;background:#1a3f6f;color:#fff}.btn-ghost{border:1px solid #d6e0ee;background:#fff;color:#1a3f6f}.btn-primary:disabled,.btn-ghost:disabled{opacity:.55;cursor:not-allowed}
    .notice{padding:.8rem 1rem;border-radius:10px;background:#e8f5f5;border:1px solid #9ae6d6;color:#00797a;font-weight:800;font-size:.86rem}.notice--error{background:#fff5f5;border-color:#fecaca;color:#b91c1c}
    .application-list{display:grid;gap:.9rem;padding:1.2rem}.application-card{border:1px solid #e4ecf7;border-radius:12px;padding:1rem;background:#fbfcff}.application-card__top{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.application-card strong{color:#1a3f6f}.application-card p{margin:.2rem 0 0;color:#5a6a7e;font-size:.82rem}.application-actions{display:flex;gap:.65rem;flex-wrap:wrap;margin-top:1rem}
    .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:800;background:#f4f7fb;color:#5a6a7e;border:1px solid #e4ecf7}.pill--ok{background:#e6f6f5;color:#00756d;border-color:#b3e8e5}.pill--warn{background:#fff3ec;color:#c14a00;border-color:#fbd0ae}
    .empty-state{display:grid;justify-items:center;text-align:center;gap:.4rem;padding:2.5rem 1rem}.empty-state h2{margin:0;color:#1a3f6f}.empty-state p{margin:0;color:#5a6a7e}
    @media (max-width:900px){.grid{grid-template-columns:1fr}}@media (max-width:680px){.official-page{padding:1rem}.application-card__top{flex-direction:column}}
  `],
})
export class LearnerOfficialCertificationsComponent {
  private readonly auth = inject(AuthService);
  private readonly applicationsSvc = inject(CandidateApplicationService);
  private readonly sessionsSvc = inject(CertificationSessionService);
  private readonly documentsSvc = inject(CertificationDocumentService);

  readonly openSessions = toSignal(this.sessionsSvc.listOpenSessionsForLearners(), {
    initialValue: [] as CertificationSession[],
  });
  readonly applications = toSignal(this.applicationsSvc.listForCurrentCandidate(), {
    initialValue: [] as CandidateApplication[],
  });
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);

  form: ApplicationForm = {
    sessionId: '',
    educationPath: 'OTHER',
  };

  docForm: DocumentForm = {
    applicationId: '',
    type: 'identity',
    fileUrl: '',
  };

  private readonly sessionMap = computed(() => {
    const map = new Map<string, CertificationSession>();
    this.openSessions().forEach((session) => {
      if (session.id) map.set(session.id, session);
    });
    return map;
  });

  async createApplication(): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    const profile = await this.firstProfile();
    const session = this.sessionMap().get(this.form.sessionId);
    if (!profile?.uid || !session) {
      this.error.set(true);
      this.notice.set('Select an open session first.');
      return;
    }

    this.busy.set(true);
    try {
      await this.applicationsSvc.submitDraft({
        sessionId: session.id,
        candidateUserId: profile.uid,
        organizationId: session.organizationId,
        status: 'draft',
        educationPath: this.form.educationPath,
        profileSnapshot: {
          displayName: profile.displayName || '',
          email: profile.email || '',
          orgId: profile.orgId || null,
        },
      });
      this.form.sessionId = '';
      this.notice.set('Application created. Add documents, then submit for review.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to create application.');
    } finally {
      this.busy.set(false);
    }
  }

  async submitApplication(app: CandidateApplication): Promise<void> {
    if (!app.id) return;
    this.busy.set(true);
    this.notice.set('');
    this.error.set(false);
    try {
      await this.applicationsSvc.submitApplication(app.id);
      this.notice.set('Application submitted for review.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to submit application.');
    } finally {
      this.busy.set(false);
    }
  }

  async addDocument(): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    const app = this.applications().find((item) => item.id === this.docForm.applicationId);
    if (!app) {
      this.error.set(true);
      this.notice.set('Select an application first.');
      return;
    }
    this.busy.set(true);
    try {
      await this.documentsSvc.add(app.id!, {
        organizationId: app.organizationId,
        applicationId: app.id,
        type: this.docForm.type,
        fileUrl: this.docForm.fileUrl.trim(),
        status: 'pending',
      });
      this.docForm.fileUrl = '';
      this.notice.set('Document link added.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to add document.');
    } finally {
      this.busy.set(false);
    }
  }

  canStartExam(app: CandidateApplication): boolean {
    return app.status === 'eligible' || app.status === 'approved_for_exam';
  }

  sessionName(sessionId: string): string {
    return this.sessionMap().get(sessionId)?.name || sessionId;
  }

  statusLabel(status: string): string {
    return status.replace(/_/g, ' ');
  }

  private firstProfile() {
    return firstValueFrom(this.auth.profile$.pipe(take(1)));
  }
}
