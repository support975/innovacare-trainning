import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CertificationService } from '../../../shared/certification-authority/certification.service';
import { CertificationSessionService } from '../../../shared/certification-authority/certification-session.service';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import {
  CandidateApplication,
  Certification,
  CertificationSession,
  CertificationType,
  CertificationExamMode,
} from '../../../shared/certification-authority/certification.models';
import { splitCsv } from '../../../shared/certification-authority/certification-utils';

type CertificationForm = {
  name: string;
  description: string;
  type: CertificationType;
  linkedProgramIds: string;
  linkedCourseIds: string;
  linkedExamIds: string;
};

type SessionForm = {
  certificationId: string;
  name: string;
  description: string;
  applicationStartDate: string;
  applicationEndDate: string;
  examStartDate: string;
  examEndDate: string;
  examMode: CertificationExamMode;
  maxCandidates: number | null;
  centers: string;
  linkedCourseIds: string;
  linkedExamIds: string;
};

@Component({
  selector: 'app-official-certifications',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="cert-page">
      <header class="page-header">
        <div>
          <div class="page-eyebrow">Manager · Certification Authority</div>
          <h1 class="page-title">Official Certifications</h1>
          <p class="page-sub">
            Create official certification records and exam sessions without changing the existing course exam engine.
          </p>
        </div>
        <div class="status-pill">Feature gated</div>
      </header>

      <section class="stat-row">
        <article class="stat-card">
          <div class="stat-value">{{ stats().certifications }}</div>
          <div class="stat-label">Certifications</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{{ stats().active }}</div>
          <div class="stat-label">Active</div>
        </article>
        <article class="stat-card">
          <div class="stat-value">{{ stats().sessions }}</div>
          <div class="stat-label">Sessions</div>
        </article>
        <article class="stat-card stat-card--warn">
          <div class="stat-value">{{ stats().openSessions }}</div>
          <div class="stat-label">Applications open</div>
        </article>
      </section>

      <section class="notice" [class.notice--error]="error()" *ngIf="notice()">
        {{ notice() }}
      </section>

      <section class="grid">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>Create Certification</h2>
              <p>Official process definition, not a course completion certificate.</p>
            </div>
          </div>

          <form class="form" (ngSubmit)="saveCertification()">
            <label class="field">
              <span>Name</span>
              <input name="certName" [(ngModel)]="certForm.name" placeholder="National registration exam, university board exam..." required />
            </label>

            <label class="field">
              <span>Type</span>
              <select name="certType" [(ngModel)]="certForm.type">
                <option value="regulatory">Regulatory</option>
                <option value="professional">Professional</option>
                <option value="academic">Academic</option>
                <option value="continuing_education">Continuing education</option>
                <option value="equivalency">Equivalency</option>
              </select>
            </label>

            <label class="field">
              <span>Description</span>
              <textarea name="certDescription" [(ngModel)]="certForm.description" rows="3" placeholder="Purpose, authority, candidate population, or governance notes."></textarea>
            </label>

            <label class="field">
              <span>Linked program IDs</span>
              <input name="linkedProgramIds" [(ngModel)]="certForm.linkedProgramIds" placeholder="Optional, comma separated" />
            </label>

            <label class="field">
              <span>Linked course IDs</span>
              <input name="linkedCourseIds" [(ngModel)]="certForm.linkedCourseIds" placeholder="Optional, comma separated" />
            </label>

            <label class="field">
              <span>Linked exam IDs</span>
              <input name="linkedExamIds" [(ngModel)]="certForm.linkedExamIds" placeholder="Optional, comma separated existing exam IDs" />
            </label>

            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="btn-primary" type="submit" [disabled]="busy()">
                {{ busy() ? 'Saving...' : (editingCertificationId() ? 'Update certification' : 'Create certification') }}
              </button>
              <button *ngIf="editingCertificationId()" class="btn-ghost" type="button" (click)="resetCertificationForm()" [disabled]="busy()">
                Cancel
              </button>
            </div>
          </form>
        </article>

        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>Create Session</h2>
              <p>Open an official exam campaign linked to a certification.</p>
            </div>
          </div>

          <form class="form" (ngSubmit)="saveSession()">
            <label class="field">
              <span>Certification</span>
              <select name="sessionCertificationId" [(ngModel)]="sessionForm.certificationId" required>
                <option value="">Select certification</option>
                <option *ngFor="let cert of certifications()" [value]="cert.id">{{ cert.name }}</option>
              </select>
            </label>

            <label class="field">
              <span>Session name</span>
              <input name="sessionName" [(ngModel)]="sessionForm.name" placeholder="Registration board exam 2027" required />
            </label>

            <label class="field">
              <span>Mode</span>
              <select name="examMode" [(ngModel)]="sessionForm.examMode">
                <option value="online">Online</option>
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </label>

            <div class="date-grid">
              <label class="field">
                <span>Application start</span>
                <input name="applicationStartDate" type="date" [(ngModel)]="sessionForm.applicationStartDate" />
              </label>
              <label class="field">
                <span>Application end</span>
                <input name="applicationEndDate" type="date" [(ngModel)]="sessionForm.applicationEndDate" />
              </label>
              <label class="field">
                <span>Exam start</span>
                <input name="examStartDate" type="date" [(ngModel)]="sessionForm.examStartDate" />
              </label>
              <label class="field">
                <span>Exam end</span>
                <input name="examEndDate" type="date" [(ngModel)]="sessionForm.examEndDate" />
              </label>
            </div>

            <label class="field">
              <span>Linked course IDs</span>
              <input name="sessionLinkedCourseIds" [(ngModel)]="sessionForm.linkedCourseIds" placeholder="Existing course IDs, comma separated" />
            </label>

            <label class="field">
              <span>Linked exam IDs</span>
              <input name="sessionLinkedExamIds" [(ngModel)]="sessionForm.linkedExamIds" placeholder="Existing exam IDs, comma separated" />
            </label>

            <label class="field">
              <span>Centers</span>
              <input name="centers" [(ngModel)]="sessionForm.centers" placeholder="Douala, Yaounde, online proctored..." />
            </label>

            <label class="field">
              <span>Description</span>
              <textarea name="sessionDescription" [(ngModel)]="sessionForm.description" rows="3" placeholder="Dates, governance notes, committee instructions."></textarea>
            </label>

            <button class="btn-primary" type="submit" [disabled]="busy() || !certifications().length">
              {{ busy() ? 'Saving...' : 'Create session' }}
            </button>
          </form>
        </article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Certification Authority Workspace</h2>
            <p>Official definitions and linked sessions for this organization.</p>
          </div>
        </div>

        <div class="table-wrap" *ngIf="certifications().length; else emptyState">
          <table class="table">
            <thead>
              <tr>
                <th>Certification</th>
                <th>Type</th>
                <th>Status</th>
                <th>Programs</th>
                <th>Courses</th>
                <th>Exams</th>
                <th>Sessions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let cert of certifications()">
                <td>
                  <div class="row-title">{{ cert.name }}</div>
                  <div class="row-sub">{{ cert.description || 'No description yet.' }}</div>
                </td>
                <td>{{ typeLabel(cert.type) }}</td>
                <td><span class="pill" [class.pill--teal]="cert.status === 'active'">{{ cert.status }}</span></td>
                <td>{{ cert.linkedProgramIds?.length || 0 }}</td>
                <td>{{ cert.linkedCourseIds?.length || 0 }}</td>
                <td>{{ cert.linkedExamIds?.length || 0 }}</td>
                <td>{{ sessionsFor(cert).length }}</td>
                <td>
                  <div class="action-row">
                    <button class="btn-ghost btn-ghost--ok" type="button" (click)="updateCertificationStatus(cert, 'active')" [disabled]="busy() || cert.status === 'active'">Publish</button>
                    <button class="btn-ghost" type="button" (click)="editCertification(cert)" [disabled]="busy()">Edit</button>
                    <button class="btn-ghost btn-ghost--danger" type="button" (click)="deleteCertification(cert)" [disabled]="busy()">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ng-template #emptyState>
          <div class="empty-state">
            <div class="empty-icon">◆</div>
            <h2>No official certifications yet</h2>
            <p>
              Start by creating the official certification record. Sessions, candidate applications,
              eligibility review and jury decisions will build on this foundation.
            </p>
          </div>
        </ng-template>
      </section>

      <section class="panel" *ngIf="sessions().length">
        <div class="panel-head">
          <div>
            <h2>Sessions</h2>
            <p>Official exam campaigns linked to certifications.</p>
          </div>
        </div>
        <div class="session-grid">
          <article class="session-card" *ngFor="let session of sessions()">
            <div class="session-card__top">
              <strong>{{ session.name }}</strong>
              <span class="pill">{{ session.status }}</span>
            </div>
            <p>{{ session.description || 'No description yet.' }}</p>
            <div class="session-meta">
              <span>{{ certificationName(session.certificationId) }}</span>
              <span>{{ session.examMode }}</span>
              <span>{{ session.linkedCourseIds?.length || 0 }} courses</span>
              <span>{{ session.linkedExamIds?.length || 0 }} exams</span>
            </div>
            <div class="action-row session-actions">
              <button class="btn-ghost btn-ghost--ok" type="button" (click)="updateSessionStatus(session, 'applications_open')" [disabled]="busy() || session.status === 'applications_open'">Open applications</button>
              <button class="btn-ghost" type="button" (click)="updateSessionStatus(session, 'applications_closed')" [disabled]="busy() || session.status === 'applications_closed'">Close</button>
              <button class="btn-ghost" type="button" (click)="updateSessionStatus(session, 'exam_in_progress')" [disabled]="busy() || session.status === 'exam_in_progress'">Open exam</button>
              <button class="btn-ghost" type="button" (click)="updateSessionStatus(session, 'results_published')" [disabled]="busy() || session.status === 'results_published'">Publish results</button>
            </div>
          </article>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Candidate Applications</h2>
            <p>Review submitted candidates and approve access to the official exam launcher.</p>
          </div>
        </div>

        <div class="table-wrap" *ngIf="applications().length; else noApplications">
          <table class="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Session</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let app of applications()">
                <td>
                  <div class="row-title">{{ candidateName(app) }}</div>
                  <div class="row-sub">{{ app.candidateUserId }}</div>
                </td>
                <td>{{ sessionName(app.sessionId) }}</td>
                <td><span class="pill" [class.pill--teal]="isExamReady(app)">{{ app.status }}</span></td>
                <td>{{ app.paymentStatus || 'not_started' }}</td>
                <td>
                  <div class="action-row">
                    <a class="btn-ghost btn-ghost--ok" [routerLink]="['/manager/certification-candidate', app.id]">Command center</a>
                    <button class="btn-ghost" type="button" (click)="reviewApplication(app, 'under_review')" [disabled]="busy()">Review</button>
                    <button class="btn-ghost" type="button" (click)="reviewApplication(app, 'missing_documents')" [disabled]="busy()">Missing docs</button>
                    <button class="btn-ghost btn-ghost--ok" type="button" (click)="reviewApplication(app, 'approved_for_exam')" [disabled]="busy()">Approve exam</button>
                    <button class="btn-ghost" type="button" (click)="reviewApplication(app, 'jury_review')" [disabled]="busy()">Jury</button>
                    <button class="btn-ghost btn-ghost--danger" type="button" (click)="reviewApplication(app, 'rejected')" [disabled]="busy()">Reject</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ng-template #noApplications>
          <div class="empty-state empty-state--compact">
            <h2>No candidate applications yet</h2>
            <p>Applications submitted by learners will appear here for eligibility review.</p>
          </div>
        </ng-template>
      </section>
    </div>
  `,
  styles: [`
    .cert-page{display:grid;gap:1.5rem;padding:1.75rem 2rem;max-width:1320px;margin:0 auto;color:#1a2b4a}
    .page-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;padding-bottom:1.5rem;border-bottom:1px solid #e4ecf7}
    .page-eyebrow{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#00a79d;margin-bottom:.4rem}
    .page-title{margin:0;font-size:clamp(1.5rem,3vw,2rem);font-weight:900;color:#1a3f6f}
    .page-sub{margin:.35rem 0 0;color:#5a6a7e;font-size:.9rem;max-width:760px;line-height:1.5}
    .status-pill{padding:.4rem .75rem;border-radius:999px;background:#e8f5f5;color:#00797a;border:1px solid #9ae6d6;font-size:.75rem;font-weight:900}
    .stat-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}
    .stat-card{background:#fff;border:1px solid #e4ecf7;border-radius:14px;padding:1.15rem 1.2rem;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .stat-card--warn{background:#fff8f0}.stat-value{font-size:1.9rem;font-weight:900;color:#1a3f6f}
    .stat-label{margin-top:.25rem;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#5a6a7e}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
    .panel{background:#fff;border:1px solid #e4ecf7;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(26,63,111,.06)}
    .panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1.1rem 1.25rem;border-bottom:1px solid #f0f4fb;background:#fbfcff}
    .panel-head h2{margin:0;font-size:1rem;color:#1a3f6f}.panel-head p{margin:.25rem 0 0;color:#5a6a7e;font-size:.82rem;line-height:1.45}
    .form{display:grid;gap:.9rem;padding:1.2rem}.field{display:grid;gap:.35rem}.field span{font-size:.78rem;font-weight:800;color:#1a2b4a}
    .field input,.field select,.field textarea{width:100%;border:1.5px solid #d6e0ee;border-radius:8px;padding:.62rem .75rem;font:inherit;font-size:.88rem;color:#1a2b4a;background:#fff}
    .field textarea{resize:vertical;line-height:1.5}.date-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
    .btn-primary{min-height:40px;border:0;border-radius:8px;background:#1a3f6f;color:#fff;font-weight:900;cursor:pointer;padding:.68rem 1rem}
    .btn-primary:disabled{background:#9bb0cc;cursor:not-allowed}.notice{padding:.8rem 1rem;border-radius:10px;background:#e8f5f5;border:1px solid #9ae6d6;color:#00797a;font-weight:800;font-size:.86rem}
    .notice--error{background:#fff5f5;border-color:#fecaca;color:#b91c1c}
    .table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse;font-size:.875rem}.table th{padding:.8rem 1rem;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#8ea0b8;background:#f8fafd;border-bottom:1px solid #f0f4fb}
    .table td{padding:.9rem 1rem;border-bottom:1px solid #f4f7fb;vertical-align:middle}.row-title{font-weight:900;color:#1a3f6f}.row-sub{margin-top:.2rem;color:#8ea0b8;font-size:.78rem;max-width:460px}
    .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.74rem;font-weight:800;background:#f4f7fb;color:#5a6a7e;border:1px solid #e4ecf7}.pill--teal{background:#e6f6f5;color:#00756d;border-color:#b3e8e5}
    .empty-state{display:grid;place-items:center;text-align:center;gap:.65rem;padding:3rem 1.25rem}.empty-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:#e8f0fb;color:#1a3f6f;font-weight:900}
    .empty-state h2{margin:0;color:#1a3f6f}.empty-state p{margin:0;color:#5a6a7e;max-width:620px;line-height:1.55}
    .session-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;padding:1.2rem}.session-card{border:1px solid #e4ecf7;border-radius:12px;padding:1rem;background:#fbfcff}
    .session-card__top{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}.session-card strong{color:#1a3f6f}.session-card p{color:#5a6a7e;font-size:.84rem;line-height:1.55}
    .session-meta{display:flex;flex-wrap:wrap;gap:.4rem}.session-meta span{font-size:.72rem;font-weight:800;color:#5a6a7e;background:#fff;border:1px solid #e4ecf7;border-radius:999px;padding:3px 8px}
    .session-actions{margin-top:.85rem}
    .action-row{display:flex;flex-wrap:wrap;gap:.45rem}.btn-ghost{min-height:34px;border:1px solid #d6e0ee;border-radius:8px;background:#fff;color:#1a3f6f;font-weight:900;cursor:pointer;padding:.45rem .7rem;font-size:.78rem;text-decoration:none;display:inline-flex;align-items:center}
    .btn-ghost:disabled{opacity:.55;cursor:not-allowed}.btn-ghost--ok{border-color:#9ae6d6;color:#00756d;background:#f0fdfa}.btn-ghost--danger{border-color:#fecaca;color:#b91c1c;background:#fff5f5}
    .empty-state--compact{padding:2rem 1.25rem}
    @media (max-width:980px){.grid{grid-template-columns:1fr}.stat-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:680px){.cert-page{padding:1rem}.stat-row,.date-grid{grid-template-columns:1fr}}
  `],
})
export class OfficialCertificationsComponent {
  private readonly certificationSvc = inject(CertificationService);
  private readonly sessionSvc = inject(CertificationSessionService);
  private readonly applicationSvc = inject(CandidateApplicationService);

  readonly certifications = toSignal(this.certificationSvc.listForCurrentOrganization(), {
    initialValue: [] as Certification[],
  });
  readonly sessions = toSignal(this.sessionSvc.listForCurrentOrganization(), {
    initialValue: [] as CertificationSession[],
  });
  readonly applications = toSignal(this.applicationSvc.listForCurrentOrganization(), {
    initialValue: [] as CandidateApplication[],
  });
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal(false);
  readonly editingCertificationId = signal<string | null>(null);

  certForm: CertificationForm = {
    name: '',
    description: '',
    type: 'professional',
    linkedProgramIds: '',
    linkedCourseIds: '',
    linkedExamIds: '',
  };

  sessionForm: SessionForm = {
    certificationId: '',
    name: '',
    description: '',
    applicationStartDate: '',
    applicationEndDate: '',
    examStartDate: '',
    examEndDate: '',
    examMode: 'online',
    maxCandidates: null,
    centers: '',
    linkedCourseIds: '',
    linkedExamIds: '',
  };

  readonly stats = computed(() => {
    const certifications = this.certifications();
    const sessions = this.sessions();
    return {
      certifications: certifications.length,
      active: certifications.filter((item) => item.status === 'active').length,
      sessions: sessions.length,
      openSessions: sessions.filter((item) => item.status === 'applications_open').length,
    };
  });

  async saveCertification(): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    const isEditing = !!this.editingCertificationId();
    try {
      await this.certificationSvc.save({
        name: this.certForm.name,
        description: this.certForm.description,
        type: this.certForm.type,
        status: 'draft',
        linkedProgramIds: splitCsv(this.certForm.linkedProgramIds),
        linkedCourseIds: splitCsv(this.certForm.linkedCourseIds),
        linkedExamIds: splitCsv(this.certForm.linkedExamIds),
      }, isEditing ? this.editingCertificationId() || undefined : undefined);
      this.resetCertificationForm();
      this.notice.set(isEditing ? 'Certification updated.' : 'Official certification created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to save certification.');
    } finally {
      this.busy.set(false);
    }
  }

  resetCertificationForm(): void {
    this.certForm = {
      name: '',
      description: '',
      type: 'professional',
      linkedProgramIds: '',
      linkedCourseIds: '',
      linkedExamIds: '',
    };
    this.editingCertificationId.set(null);
  }

  async saveSession(): Promise<void> {
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.sessionSvc.save({
        certificationId: this.sessionForm.certificationId,
        name: this.sessionForm.name,
        description: this.sessionForm.description,
        applicationStartDate: this.sessionForm.applicationStartDate || null,
        applicationEndDate: this.sessionForm.applicationEndDate || null,
        examStartDate: this.sessionForm.examStartDate || null,
        examEndDate: this.sessionForm.examEndDate || null,
        examMode: this.sessionForm.examMode,
        maxCandidates: this.sessionForm.maxCandidates,
        centers: splitCsv(this.sessionForm.centers),
        linkedCourseIds: splitCsv(this.sessionForm.linkedCourseIds),
        linkedExamIds: splitCsv(this.sessionForm.linkedExamIds),
        status: 'draft',
      });
      this.sessionForm = {
        certificationId: this.sessionForm.certificationId,
        name: '',
        description: '',
        applicationStartDate: '',
        applicationEndDate: '',
        examStartDate: '',
        examEndDate: '',
        examMode: 'online',
        maxCandidates: null,
        centers: '',
        linkedCourseIds: '',
        linkedExamIds: '',
      };
      this.notice.set('Official certification session created.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to create session.');
    } finally {
      this.busy.set(false);
    }
  }

  sessionsFor(certification: Certification): CertificationSession[] {
    return this.sessions().filter((session) => session.certificationId === certification.id);
  }

  certificationName(certificationId: string): string {
    return this.certifications().find((item) => item.id === certificationId)?.name || certificationId;
  }

  sessionName(sessionId: string): string {
    return this.sessions().find((item) => item.id === sessionId)?.name || sessionId;
  }

  candidateName(application: CandidateApplication): string {
    const snapshot = application.profileSnapshot as any;
    return snapshot?.displayName || snapshot?.name || snapshot?.email || 'Candidate';
  }

  isExamReady(application: CandidateApplication): boolean {
    return ['eligible', 'approved_for_exam', 'exam_completed', 'passed'].includes(application.status);
  }

  async reviewApplication(application: CandidateApplication, status: CandidateApplication['status']): Promise<void> {
    if (!application.id) return;
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.applicationSvc.updateReview(application.id, {
        status,
        reviewedAt: new Date().toISOString(),
      } as Partial<CandidateApplication>);
      this.notice.set('Candidate application updated.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to update candidate application.');
    } finally {
      this.busy.set(false);
    }
  }

  async updateSessionStatus(session: CertificationSession, status: CertificationSession['status']): Promise<void> {
    if (!session.id) return;
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.sessionSvc.updateStatus(session.id, status);
      this.notice.set('Certification session updated.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to update certification session.');
    } finally {
      this.busy.set(false);
    }
  }

  typeLabel(type: CertificationType): string {
    return type.replace(/_/g, ' ');
  }

  async updateCertificationStatus(certification: Certification, status: Certification['status']): Promise<void> {
    if (!certification.id) return;
    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.certificationSvc.save({ ...certification, status }, certification.id);
      this.notice.set('Certification status updated.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to update certification.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteCertification(certification: Certification): Promise<void> {
    if (!certification.id) return;
    if (!confirm(`Archive "${certification.name}"? This action cannot be undone.`)) return;

    this.notice.set('');
    this.error.set(false);
    this.busy.set(true);
    try {
      await this.certificationSvc.archive(certification.id);
      this.notice.set('Certification archived.');
    } catch (err: any) {
      this.error.set(true);
      this.notice.set(err?.message || 'Unable to archive certification.');
    } finally {
      this.busy.set(false);
    }
  }

  editCertification(certification: Certification): void {
    this.editingCertificationId.set(certification.id || null);
    this.certForm.name = certification.name;
    this.certForm.description = certification.description || '';
    this.certForm.type = certification.type;
    this.certForm.linkedProgramIds = (certification.linkedProgramIds || []).join(', ');
    this.certForm.linkedCourseIds = (certification.linkedCourseIds || []).join(', ');
    this.certForm.linkedExamIds = (certification.linkedExamIds || []).join(', ');
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
