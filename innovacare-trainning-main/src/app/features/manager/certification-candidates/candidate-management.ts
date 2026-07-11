import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/auth';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CertificationDocumentService } from '../../../shared/certification-authority/certification-document.service';
import {
  ApplicationDocument,
  CandidateApplication,
} from '../../../shared/certification-authority/certification.models';
import { downloadElementAsPdf } from '../../../shared/utils/credential-pdf';

@Component({
  selector: 'app-candidate-management',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './candidate-management.html',
  styleUrl: './candidate-management.css'
})
export class CandidateManagementComponent implements OnInit {
  private auth = inject(AuthService);
  private firestore = inject(Firestore);
  private applicationsSvc = inject(CandidateApplicationService);
  private documentsSvc = inject(CertificationDocumentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  applicationId = '';
  candidate = signal<CandidateApplication | null>(null);
  documents = signal<ApplicationDocument[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  busy = signal(false);
  rejectReason = signal('');
  showRejectForm = signal(false);
  currentUser = this.auth.profile$;

  organizationName = signal('');
  showCredentialForm = signal(false);
  credentialForm = {
    profession: '',
    membershipNumber: '',
  };

  ngOnInit() {
    this.applicationId = this.route.snapshot.paramMap.get('applicationId') || '';
    if (!this.applicationId) {
      this.router.navigate(['/manager/dashboard']);
      return;
    }

    this.applicationsSvc.application$(this.applicationId).subscribe({
      next: (app) => {
        if (!app) {
          this.error.set('Application not found');
        }
        this.candidate.set(app);
        this.loading.set(false);
        if (app) {
          this.credentialForm.profession = app.profileSnapshot?.['profession'] || '';
          this.credentialForm.membershipNumber = app.membershipCard?.number || '';
          void this.loadOrganizationName(app.organizationId);
        }
      },
      error: (err) => {
        this.error.set(err?.message || 'Failed to load application');
        this.loading.set(false);
      },
    });

    this.documentsSvc.list(this.applicationId).subscribe({
      next: (docs) => this.documents.set(docs || []),
      error: () => this.error.set('Failed to load documents'),
    });
  }

  private async loadOrganizationName(organizationId: string) {
    if (!organizationId) return;
    try {
      const snap = await getDoc(doc(this.firestore, `organizations/${organizationId}`));
      this.organizationName.set(snap.exists() ? (snap.data() as any)?.name || '' : '');
    } catch {
      this.organizationName.set('');
    }
  }

  async downloadCredential(elementId: string, kind: 'membership-card' | 'certificate') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const name = (this.candidateDisplayName || 'candidate').replace(/\s+/g, '-').toLowerCase();
    await downloadElementAsPdf(el, `${kind}-${name}.pdf`);
  }

  get candidateDisplayName(): string {
    return this.candidate()?.profileSnapshot?.['displayName'] || 'Unknown candidate';
  }

  get candidateEmail(): string {
    return this.candidate()?.profileSnapshot?.['email'] || '';
  }

  get paymentDocument(): ApplicationDocument | undefined {
    const receipts = this.documents().filter((d) => d.type === 'payment_proof');
    return receipts[receipts.length - 1];
  }

  get reviewDocuments(): ApplicationDocument[] {
    return this.documents().filter((d) => d.type !== 'payment_proof');
  }

  private get organizationId(): string {
    return this.candidate()?.organizationId || '';
  }

  async approveDocument(docId: string) {
    try {
      this.busy.set(true);
      this.error.set(null);
      await this.documentsSvc.review(this.applicationId, docId, {
        organizationId: this.organizationId,
        status: 'accepted',
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to approve document');
    } finally {
      this.busy.set(false);
    }
  }

  async rejectDocument(docId: string) {
    try {
      this.busy.set(true);
      this.error.set(null);
      await this.documentsSvc.review(this.applicationId, docId, {
        organizationId: this.organizationId,
        status: 'rejected',
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to reject document');
    } finally {
      this.busy.set(false);
    }
  }

  async approvePaymentDocument() {
    const receipt = this.paymentDocument;
    if (!receipt?.id) return;

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.documentsSvc.review(this.applicationId, receipt.id, {
        organizationId: this.organizationId,
        status: 'accepted',
      });
      await this.applicationsSvc.updateReview(this.applicationId, { paymentStatus: 'paid' });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to approve payment');
    } finally {
      this.busy.set(false);
    }
  }

  async approveApplication() {
    try {
      this.busy.set(true);
      this.error.set(null);
      await this.applicationsSvc.updateReview(this.applicationId, {
        status: 'eligible',
        eligibilityDecision: 'eligible',
        eligibilityReviewedBy: this.auth.currentUid ?? undefined,
        eligibilityReviewedAt: new Date(),
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to approve application');
    } finally {
      this.busy.set(false);
    }
  }

  async rejectApplication() {
    if (!this.rejectReason().trim()) {
      this.error.set('Please provide a rejection reason');
      return;
    }

    try {
      this.busy.set(true);
      this.error.set(null);
      await this.applicationsSvc.updateReview(this.applicationId, {
        status: 'rejected',
        eligibilityDecision: 'rejected',
        reviewerNotes: this.rejectReason(),
        eligibilityReviewedBy: this.auth.currentUid ?? undefined,
        eligibilityReviewedAt: new Date(),
      });
      this.showRejectForm.set(false);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to reject application');
    } finally {
      this.busy.set(false);
    }
  }

  async approveExam() {
    try {
      this.busy.set(true);
      this.error.set(null);
      await this.applicationsSvc.updateReview(this.applicationId, {
        status: 'approved_for_exam',
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to approve exam access');
    } finally {
      this.busy.set(false);
    }
  }

  async approveCertification() {
    if (!confirm('Approve this candidate? A digital membership card and certificate of good standing will be issued, and a summary email will be sent to the candidate.')) {
      return;
    }
    try {
      this.busy.set(true);
      this.error.set(null);
      this.success.set(null);
      const { membershipNumber, certificateNumber } =
        await this.applicationsSvc.approveAndIssueCertification(this.applicationId, {
          membershipNumber: this.credentialForm.membershipNumber,
          profession: this.credentialForm.profession,
        });
      this.success.set(
        `Candidate approved. Membership card ${membershipNumber} and certificate ${certificateNumber} issued.`
      );
      this.showCredentialForm.set(false);
      setTimeout(() => this.success.set(null), 6000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to approve and issue certification');
    } finally {
      this.busy.set(false);
    }
  }

  async validateRenewal() {
    if (!confirm('Validate this renewal? The membership card and certificate will be renewed for another year, and the candidate will be notified.')) {
      return;
    }
    try {
      this.busy.set(true);
      this.error.set(null);
      this.success.set(null);
      const { membershipNumber, certificateNumber } =
        await this.applicationsSvc.approveAndIssueCertification(this.applicationId, {
          membershipNumber: this.credentialForm.membershipNumber,
          profession: this.credentialForm.profession,
        });
      this.success.set(
        `Renewal validated. Membership card ${membershipNumber} and certificate ${certificateNumber} renewed for 1 year.`
      );
      this.showCredentialForm.set(false);
      setTimeout(() => this.success.set(null), 6000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to validate renewal');
    } finally {
      this.busy.set(false);
    }
  }

  get examResult() {
    return this.candidate()?.examResult ?? null;
  }

  get renewalStatus() {
    return this.candidate()?.renewalStatus ?? 'not_required';
  }

  get renewalCoursesCompleted(): string[] {
    return this.candidate()?.renewalCoursesCompleted ?? [];
  }

  get renewalPointsEarned(): number {
    return this.candidate()?.renewalPointsEarned ?? 0;
  }

  get membershipCard() {
    return this.candidate()?.membershipCard ?? null;
  }

  get certificate() {
    return this.candidate()?.certificate ?? null;
  }

  isCredentialExpired(expiresAt: any): boolean {
    if (!expiresAt) return false;
    const ms = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : new Date(expiresAt).getTime();
    return Number.isFinite(ms) && ms < Date.now();
  }

  asDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'accepted':
      case 'paid':
      case 'eligible':
      case 'approved_for_exam':
      case 'passed':
      case 'active':
        return 'badge-success';
      case 'rejected':
      case 'failed':
      case 'expired':
      case 'revoked':
        return 'badge-danger';
      case 'under_review':
      case 'needs_replacement':
      case 'pending':
      case 'exam_completed':
      case 'jury_review':
        return 'badge-warning';
      default:
        return 'badge-info';
    }
  }

  allDocumentsApproved(): boolean {
    const docs = this.reviewDocuments;
    return docs.length > 0 && docs.every(d => d.status === 'accepted');
  }

  paymentApproved(): boolean {
    return this.candidate()?.paymentStatus === 'paid';
  }

  canApproveApplication(): boolean {
    return this.allDocumentsApproved() && this.paymentApproved();
  }
}
