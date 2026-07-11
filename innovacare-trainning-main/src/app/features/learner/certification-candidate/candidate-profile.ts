import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/auth';
import { CandidateApplicationService } from '../../../shared/certification-authority/candidate-application.service';
import { CertificationDocumentService } from '../../../shared/certification-authority/certification-document.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import {
  ApplicationDocument,
  ApplicationDocumentType,
  CandidateApplication,
} from '../../../shared/certification-authority/certification.models';
import { downloadElementAsPdf } from '../../../shared/utils/credential-pdf';

type RenewalCourseRow = {
  courseId: string;
  title: string;
  ceCredit: number;
  completed: boolean;
};

const DOCUMENT_TYPES: Array<{ value: ApplicationDocumentType; label: string }> = [
  { value: 'identity', label: 'Identity Document' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'license', label: 'Professional License' },
  { value: 'work_experience', label: 'Work Experience Certificate' },
  { value: 'other', label: 'Other Document' },
];

@Component({
  selector: 'app-candidate-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './candidate-profile.html',
  styleUrl: './candidate-profile.css'
})
export class CandidateProfileComponent implements OnInit {
  private storage = inject(Storage);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private applicationsSvc = inject(CandidateApplicationService);
  private documentsSvc = inject(CertificationDocumentService);
  private blueprintSvc = inject(ExamBlueprintService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  applicationId = '';
  candidate = signal<CandidateApplication | null>(null);
  documents = signal<ApplicationDocument[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  uploadingFile = signal(false);
  currentUser = this.auth.profile$;

  documentTypes = DOCUMENT_TYPES;

  // Contact phone (for SMS notifications)
  phoneInput = '';
  savingPhone = signal(false);

  // Renewal
  renewalCourses = signal<RenewalCourseRow[]>([]);
  renewalRequiredPoints = signal(0);
  loadingRenewal = signal(false);
  submittingRenewal = signal(false);

  organizationName = signal('');

  ngOnInit() {
    this.applicationId = this.route.snapshot.paramMap.get('applicationId') || '';
    if (!this.applicationId) {
      this.router.navigate(['/learner/official-certifications']);
      return;
    }

    this.applicationsSvc.application$(this.applicationId).subscribe({
      next: (app) => {
        if (!app) {
          this.error.set('Application not found');
        }
        this.candidate.set(app);
        this.phoneInput = app?.profileSnapshot?.['phone'] || '';
        this.loading.set(false);
        if (app) {
          void this.loadRenewalRequirements(app);
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

  get isMembershipExpiringSoon(): boolean {
    const expiresAt = this.asDate(this.candidate()?.membershipCard?.expiresAt);
    if (!expiresAt) return false;
    const daysLeft = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return daysLeft <= 30;
  }

  get isMembershipExpired(): boolean {
    const expiresAt = this.asDate(this.candidate()?.membershipCard?.expiresAt);
    return !!expiresAt && expiresAt.getTime() < Date.now();
  }

  get renewalTotalPointsEarned(): number {
    return this.renewalCourses()
      .filter((c) => c.completed)
      .reduce((sum, c) => sum + (c.ceCredit || 0), 0);
  }

  get renewalAllCoursesCompleted(): boolean {
    const courses = this.renewalCourses();
    return courses.length > 0 && courses.every((c) => c.completed);
  }

  get renewalReady(): boolean {
    const pointsOk = this.renewalTotalPointsEarned >= this.renewalRequiredPoints();
    return this.renewalAllCoursesCompleted && pointsOk;
  }

  private async loadRenewalRequirements(app: CandidateApplication) {
    if (!app.membershipCard) return;

    this.loadingRenewal.set(true);
    try {
      const blueprint = await this.blueprintSvc.getPublishedBlueprintForSession(app.sessionId);
      const courseIds = blueprint?.renewalCourseIds || [];
      this.renewalRequiredPoints.set(blueprint?.renewalRequiredPoints || 0);

      if (courseIds.length === 0) {
        this.renewalCourses.set([]);
        return;
      }

      const uid = this.auth.currentUid;
      const rows: RenewalCourseRow[] = await Promise.all(
        courseIds.map(async (courseId) => {
          const [courseSnap, enrollmentSnap] = await Promise.all([
            getDoc(doc(this.firestore, `courses/${courseId}`)),
            uid ? getDoc(doc(this.firestore, `users/${uid}/enrollments/${courseId}`)) : Promise.resolve(null),
          ]);
          const courseData = courseSnap.exists() ? (courseSnap.data() as any) : null;
          const enrollmentData = enrollmentSnap && enrollmentSnap.exists() ? (enrollmentSnap.data() as any) : null;
          return {
            courseId,
            title: courseData?.title || courseId,
            ceCredit: Number(courseData?.ceCredit) || 0,
            completed: enrollmentData?.status === 'completed',
          };
        })
      );
      this.renewalCourses.set(rows);
    } catch (err: any) {
      console.warn('Unable to load renewal requirements', err);
    } finally {
      this.loadingRenewal.set(false);
    }
  }

  async submitForRenewal() {
    if (!this.renewalReady) return;
    this.submittingRenewal.set(true);
    this.error.set(null);
    try {
      await this.applicationsSvc.submitRenewalProgress(this.applicationId, {
        completedCourseIds: this.renewalCourses().filter((c) => c.completed).map((c) => c.courseId),
        pointsEarned: this.renewalTotalPointsEarned,
        ready: true,
      });
      this.success.set('Renewal submitted. Your certification authority will review and validate it shortly.');
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to submit renewal');
    } finally {
      this.submittingRenewal.set(false);
    }
  }

  async savePhone() {
    if (!this.phoneInput.trim()) return;
    this.savingPhone.set(true);
    this.error.set(null);
    try {
      await this.applicationsSvc.updateContactPhone(this.applicationId, this.phoneInput.trim());
      this.success.set('Phone number saved.');
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to save phone number');
    } finally {
      this.savingPhone.set(false);
    }
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
    return this.candidate()?.profileSnapshot?.['displayName'] || '';
  }

  get candidateEmail(): string {
    return this.candidate()?.profileSnapshot?.['email'] || '';
  }

  get paymentDocument(): ApplicationDocument | undefined {
    const receipts = this.documents().filter((d) => d.type === 'payment_proof');
    return receipts[receipts.length - 1];
  }

  get otherDocuments(): ApplicationDocument[] {
    return this.documents().filter((d) => d.type !== 'payment_proof');
  }

  async uploadDocument(event: any, documentType: ApplicationDocumentType) {
    const file = event.target.files[0];
    if (!file) return;

    const app = this.candidate();
    if (!app) return;

    this.uploadingFile.set(true);
    this.error.set(null);

    try {
      const filePath = `candidateApplications/${this.applicationId}/${Date.now()}_${file.name}`;
      const storageRef = ref(this.storage, filePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await this.documentsSvc.add(this.applicationId, {
        organizationId: app.organizationId,
        type: documentType,
        fileUrl: url,
        status: 'pending',
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to upload document');
    } finally {
      this.uploadingFile.set(false);
      event.target.value = '';
    }
  }

  async uploadPaymentReceipt(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const app = this.candidate();
    if (!app) return;

    this.uploadingFile.set(true);
    this.error.set(null);

    try {
      const filePath = `candidateApplications/${this.applicationId}/receipt_${Date.now()}_${file.name}`;
      const storageRef = ref(this.storage, filePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await this.documentsSvc.add(this.applicationId, {
        organizationId: app.organizationId,
        type: 'payment_proof',
        fileUrl: url,
        status: 'pending',
      });
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to upload receipt');
    } finally {
      this.uploadingFile.set(false);
      event.target.value = '';
    }
  }

  getDocumentLabel(type: string): string {
    return this.documentTypes.find(d => d.value === type)?.label || type;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'accepted':
      case 'paid':
      case 'eligible':
      case 'approved_for_exam':
      case 'passed':
        return 'badge-success';
      case 'rejected':
      case 'failed':
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

  asDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
}
