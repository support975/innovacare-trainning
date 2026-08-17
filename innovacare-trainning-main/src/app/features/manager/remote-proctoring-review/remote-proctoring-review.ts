import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { ProctorService } from '../../../data/proctor.service';
import {
  RemoteProctoringCandidate,
  RemoteProctoringService,
} from '../../../data/remote-proctoring.service';
import { ExamBlueprintService } from '../../../data/exam-blueprint.service';
import { ExamSession } from '../../../data/models';
import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
import { LanguageService } from '../../../shared/services/language';

@Component({
  selector: 'app-remote-proctoring-review',
  standalone: true,
  imports: [CommonModule, FormsModule, ToDatePipe],
  templateUrl: './remote-proctoring-review.html',
  styleUrls: ['./remote-proctoring-review.css'],
})
export class RemoteProctoringReviewComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly proctorSvc = inject(ProctorService);
  private readonly remoteSvc = inject(RemoteProctoringService);
  private readonly blueprintSvc = inject(ExamBlueprintService);
  readonly lang = inject(LanguageService);

  sessions = signal<ExamSession[]>([]);
  selectedSession = signal<ExamSession | null>(null);
  candidates = signal<RemoteProctoringCandidate[]>([]);
  selectedCandidate = signal<RemoteProctoringCandidate | null>(null);
  examTitles = new Map<string, string>();

  loading = signal(false);
  busy = signal(false);
  error = signal('');
  success = signal('');

  reviewNotes = '';

  readonly stats = computed(() => {
    const list = this.candidates();
    return {
      total: list.length,
      flagged: list.filter((c) => (c.record.flags?.length ?? 0) > 0).length,
      unreviewed: list.filter((c) => this.unreviewedFlagCount(c) > 0).length,
      cleared: list.filter((c) => c.record.finalDecision === 'cleared' || c.record.finalDecision === 'flagged_pass').length,
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
        // Only vendor-proctored sessions are relevant to this queue.
        const remoteSessions = sessions.filter((s) => s.proctoringVendor === 'talview');
        this.sessions.set(remoteSessions);
        for (const s of remoteSessions) void this.resolveExamTitle(s.examId);
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
      this.candidates.set(await this.remoteSvc.loadCandidates(session.id));
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

  openCandidate(c: RemoteProctoringCandidate): void {
    this.selectedCandidate.set(c);
    this.reviewNotes = c.record.reviewNotes || '';
    this.error.set('');
    this.success.set('');
  }

  closeCandidate(): void {
    this.selectedCandidate.set(null);
  }

  unreviewedFlagCount(c: RemoteProctoringCandidate): number {
    return (c.record.flags || []).filter((f) => !f.reviewDecision).length;
  }

  statusLabel(c: RemoteProctoringCandidate): string {
    if (c.record.finalDecision === 'invalidated') return this.lang.t('Invalidated');
    if (c.record.finalDecision === 'cleared') return this.lang.t('Cleared');
    if (c.record.finalDecision === 'flagged_pass') return this.lang.t('Cleared (flagged)');
    if (c.record.status === 'identity_rejected') return this.lang.t('Identity rejected');
    if (this.unreviewedFlagCount(c) > 0) return this.lang.t('Needs review');
    if (c.record.status === 'completed') return this.lang.t('Awaiting review');
    return this.lang.t('In progress');
  }

  statusClass(c: RemoteProctoringCandidate): string {
    if (c.record.finalDecision === 'invalidated' || c.record.status === 'identity_rejected') return 'badge-danger';
    if (c.record.finalDecision === 'cleared') return 'badge-success';
    if (c.record.finalDecision === 'flagged_pass') return 'badge-warning';
    if (this.unreviewedFlagCount(c) > 0) return 'badge-warning';
    return 'badge-muted';
  }

  severityClass(severity: string): string {
    if (severity === 'high') return 'badge-danger';
    if (severity === 'medium') return 'badge-warning';
    return 'badge-muted';
  }

  async reviewFlag(
    c: RemoteProctoringCandidate,
    flagId: string,
    decision: 'dismissed' | 'escalated' | 'confirmed_violation'
  ): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.remoteSvc.reviewFlag(session.id, c, flagId, decision);
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to review the flag.'));
    } finally {
      this.busy.set(false);
    }
  }

  async finalizeDecision(
    c: RemoteProctoringCandidate,
    decision: 'cleared' | 'flagged_pass' | 'invalidated'
  ): Promise<void> {
    const session = this.selectedSession();
    if (!session?.id) return;
    if (!confirm(
      this.lang.t('Confirm this decision for {name}? They will be notified by email.', { name: c.name })
    )) return;

    this.busy.set(true);
    this.error.set('');
    try {
      await this.remoteSvc.finalizeDecision(session.id, c, decision, this.reviewNotes);
      this.success.set(`✓ ${this.lang.t('Decision recorded for {name}.', { name: c.name })}`);
      await this.refreshCandidates();
      this.syncSelected(c.uid);
    } catch (e: any) {
      this.error.set(e?.message || this.lang.t('Failed to record the decision.'));
    } finally {
      this.busy.set(false);
    }
  }

  private syncSelected(uid: string): void {
    const updated = this.candidates().find((x) => x.uid === uid) || null;
    this.selectedCandidate.set(updated);
  }

  trackByUid(_i: number, c: RemoteProctoringCandidate): string {
    return c.uid;
  }
}
