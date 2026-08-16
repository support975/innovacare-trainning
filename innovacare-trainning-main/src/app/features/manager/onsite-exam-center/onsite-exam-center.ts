import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { ProctorService } from '../../../data/proctor.service';
import { OnsiteExamService, OnsiteCandidate } from '../../../data/onsite-exam.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import { ExamSession } from '../../../data/models';
import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
import { LanguageService } from '../../../shared/services/language';

@Component({
  selector: 'app-onsite-exam-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ToDatePipe],
  templateUrl: './onsite-exam-center.html',
  styleUrls: ['./onsite-exam-center.css'],
})
export class OnsiteExamCenterComponent implements OnInit {
  private auth = inject(AuthService);
  private proctorSvc = inject(ProctorService);
  private onsiteSvc = inject(OnsiteExamService);
  private blueprintSvc = inject(ExamBlueprintService);
  readonly lang = inject(LanguageService);

  sessions = signal<ExamSession[]>([]);
  selectedSession = signal<ExamSession | null>(null);
  candidates = signal<OnsiteCandidate[]>([]);
  selectedCandidate = signal<OnsiteCandidate | null>(null);
  examTitles = new Map<string, string>();

  loading = signal(false);
  busy = signal(false);
  error = signal('');
  success = signal('');

  // Card issuance form
  cardFormOpen = signal(false);
  cardForm = { profession: '', membershipNumber: '' };

  readonly stats = computed(() => {
    const list = this.candidates();
    const attempted = list.filter((c) => c.attempt);
    return {
      total: list.length,
      verified: list.filter((c) => c.verified || c.examCompleted).length,
      attempted: attempted.length,
      passed: attempted.filter((c) => c.attempt!.passed).length,
      published: attempted.filter((c) => c.attempt!.resultPublishedAt).length,
      cardsIssued: attempted.filter((c) => c.attempt!.cardIssuedAt).length,
    };
  });

  async ngOnInit(): Promise<void> {
    const profile = await firstValueFrom(this.auth.profile$.pipe(take(1)));
    if (!profile?.orgId) {
      this.error.set(this.lang.t('Organization missing from your profile.'));
      return;
    }
    this.proctorSvc.listSessionsByOrg$(profile.orgId).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        for (const s of sessions) void this.resolveExamTitle(s.examId);
      },
      error: (e) => this.error.set(e?.message || this.lang.t('Failed to load sessions.')),
    });
  }

  private async resolveExamTitle(examId: string): Promise<void> {
    if (!examId || this.examTitles.has(examId)) return;
    try {
      const bp = await this.blueprintSvc.getBlueprint(examId);
      this.examTitles.set(examId, bp?.title || examId);
    } catch {
      this.examTitles.set(examId, examId);
    }
  }

  examTitle(examId: string): string {
    return this.examTitles.get(examId) || examId;
  }

  async selectSession(session: ExamSession): Promise<void> {
    this.selectedSession.set(session);
    this.selectedCandidate.set(null);
    this.error.set('');
    this.success.set('');
    await this.refreshCandidates();
  }

  async refreshCandidates(): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id) return;
    this.loading.set(true);
    try {
      this.candidates.set(await this.onsiteSvc.loadCandidates(session.id));
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to load candidates.'));
    } finally {
      this.loading.set(false);
    }
  }

  backToSessions(): void {
    this.selectedSession.set(null);
    this.selectedCandidate.set(null);
    this.candidates.set([]);
  }

  openCandidate(c: OnsiteCandidate): void {
    this.selectedCandidate.set(c);
    this.cardFormOpen.set(false);
    this.cardForm = { profession: '', membershipNumber: '' };
    this.error.set('');
    this.success.set('');
  }

  closeCandidate(): void {
    this.selectedCandidate.set(null);
  }

  candidateStatus(c: OnsiteCandidate): string {
    if (c.attempt?.cardIssuedAt) return this.lang.t('Card issued');
    if (c.attempt?.resultPublishedAt) return this.lang.t('Result published');
    if (c.attempt) return c.attempt.passed ? this.lang.t('Passed — pending review') : this.lang.t('Failed — pending review');
    if (c.examCompleted) return this.lang.t('Exam completed');
    if (c.verified) return this.lang.t('Verified — awaiting exam');
    if (c.candidacyApproved === true) return this.lang.t('Approved — awaiting verification');
    if (c.candidacyApproved === false) return this.lang.t('Candidacy rejected');
    if (c.documents.length) return this.lang.t('Documents to review');
    return this.lang.t('Awaiting documents');
  }

  async reviewDocument(c: OnsiteCandidate, docId: string, status: 'approved' | 'rejected'): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id) return;
    this.busy.set(true);
    try {
      await this.onsiteSvc.reviewDocument(session.id, c, docId, status);
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to review the document.'));
    } finally {
      this.busy.set(false);
    }
  }

  allDocsApproved(c: OnsiteCandidate): boolean {
    return c.documents.length > 0 && c.documents.every((d) => d.status === 'approved');
  }

  async setCandidacy(c: OnsiteCandidate, approved: boolean): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id) return;
    if (!confirm(approved
      ? `Approve ${c.name}'s candidacy? They will be notified by email and can be verified by the proctor on exam day.`
      : `Reject ${c.name}'s candidacy? They will be notified by email.`)) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.onsiteSvc.setCandidacy(session.id, c, approved);
      this.success.set(approved
        ? `✓ ${this.lang.t("{name}'s candidacy approved.", { name: c.name })}`
        : this.lang.t("{name}'s candidacy rejected.", { name: c.name }));
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to update candidacy.'));
    } finally {
      this.busy.set(false);
    }
  }

  async emailCredentials(c: OnsiteCandidate): Promise<void> {
    if (!c.applicationId) return;
    if (!confirm(`Email the digital membership card and certificate of good standing (PDF) to ${c.email}?`)) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.onsiteSvc.emailCredentials(c.applicationId);
      this.success.set(`✓ ${this.lang.t('Card & certificate PDFs are being emailed to {email}.', { email: c.email })}`);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to queue the credentials email.'));
    } finally {
      this.busy.set(false);
    }
  }

  docTypeLabel(type: string): string {
    switch (type) {
      case 'identity': return this.lang.t('Identity');
      case 'diploma': return this.lang.t('Diploma');
      case 'payment_proof': return this.lang.t('Payment proof');
      default: return this.lang.t('Other');
    }
  }

  candidateStatusClass(c: OnsiteCandidate): string {
    if (c.attempt?.cardIssuedAt) return 'badge-success';
    if (c.attempt?.resultPublishedAt) return c.attempt.passed ? 'badge-success' : 'badge-danger';
    if (c.attempt) return 'badge-warning';
    if (c.verified) return 'badge-info';
    return 'badge-muted';
  }

  async publishResult(c: OnsiteCandidate): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id || !c.attempt) return;
    if (!confirm(`Publish the result for ${c.name}? An email${c.phone ? ' and SMS' : ''} with the score will be sent to the candidate.`)) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.onsiteSvc.publishResult(session.id, c, this.examTitle(session.examId));
      this.success.set(`✓ ${this.lang.t('Result published and sent to {name}.', { name: c.name })}`);
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to publish result.'));
    } finally {
      this.busy.set(false);
    }
  }

  openCardForm(): void {
    this.cardFormOpen.set(true);
  }

  async issueCard(c: OnsiteCandidate): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id || !c.attempt?.passed) return;
    if (!confirm(`Issue a membership card to ${c.name}? The card and certificate will be created, added to the member registry, and delivered by email${c.phone ? ' and SMS' : ''}.`)) return;

    this.busy.set(true);
    this.error.set('');
    try {
      const { membershipNumber, certificateNumber } = await this.onsiteSvc.issueCard(session.id, c, {
        profession: this.cardForm.profession,
        membershipNumber: this.cardForm.membershipNumber,
      });
      this.success.set(`✓ ${this.lang.t('Card {membershipNumber} and certificate {certificateNumber} issued and delivered to {name}.', { membershipNumber, certificateNumber, name: c.name })}`);
      this.cardFormOpen.set(false);
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to issue the card.'));
    } finally {
      this.busy.set(false);
    }
  }

  private syncSelected(uid: string): void {
    const updated = this.candidates().find((x) => x.uid === uid) || null;
    this.selectedCandidate.set(updated);
  }

  trackByUid(_i: number, c: OnsiteCandidate): string {
    return c.uid;
  }
}
