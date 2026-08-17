import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Subject, interval, switchMap, takeUntil } from 'rxjs';
import { LanguageService } from '../../../shared/services/language';
import { REMOTE_PROCTORING_ADAPTER } from '../../../data/remote-proctoring-adapter';
import { RemoteProctoringRecord } from '../../../data/models';

type PrecheckStep = 'starting' | 'identity_pending' | 'identity_verified' | 'identity_rejected' | 'error';

@Component({
  selector: 'app-exam-session-remote-precheck',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exam-session-remote-precheck.html',
  styleUrls: ['./exam-session-remote-precheck.css'],
})
export class ExamSessionRemotePrecheckComponent implements OnInit, OnDestroy {
  @ViewChild('widgetContainer') widgetContainer?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly afs = inject(Firestore);
  private readonly adapter = inject(REMOTE_PROCTORING_ADAPTER);
  readonly lang = inject(LanguageService);

  sessionId = '';
  candidateUid = '';
  learnerEmail = '';
  token = '';
  examId = '';

  readonly step = signal<PrecheckStep>('starting');
  readonly errorMessage = signal('');
  readonly flagNotice = signal(false);

  private destroy$ = new Subject<void>();
  private pollingCount = 0;
  private readonly maxPollingAttempts = 60; // 5 minutes at 5s intervals, matches exam-session-launcher

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.candidateUid = this.route.snapshot.queryParamMap.get('candidateUid') || '';
    this.learnerEmail = this.route.snapshot.queryParamMap.get('learnerEmail') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (!this.sessionId || !this.candidateUid || !this.token) {
      this.step.set('error');
      this.errorMessage.set(this.lang.t('Invalid verification session.'));
      return;
    }

    void this.start();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.adapter.unmountWidget();
  }

  private async start(): Promise<void> {
    try {
      const sessionSnap = await getDoc(doc(this.afs, `examSessions/${this.sessionId}`));
      const session = sessionSnap.data() as { examId?: string; durationMinutes?: number } | undefined;
      this.examId = session?.examId || '';

      const vendorSession = await this.adapter.createSession({
        sessionId: this.sessionId,
        candidateUid: this.candidateUid,
        candidateName: '',
        candidateEmail: this.learnerEmail,
        examDurationMinutes: session?.durationMinutes || 60,
      });

      this.step.set('identity_pending');
      queueMicrotask(() => {
        if (this.widgetContainer) {
          void this.adapter.mountWidget(this.widgetContainer.nativeElement, vendorSession);
        }
      });

      this.startStatusPolling();
    } catch (e: unknown) {
      this.step.set('error');
      const message = e instanceof Error ? e.message : '';
      this.errorMessage.set(message || this.lang.t('Unable to start identity verification.'));
    }
  }

  private startStatusPolling(): void {
    interval(5000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.readRecord())
      )
      .subscribe((record) => {
        if (!record) {
          this.pollingCount++;
          if (this.pollingCount >= this.maxPollingAttempts) {
            this.step.set('error');
            this.errorMessage.set(this.lang.t('Verification timed out. Please contact your proctor.'));
            this.destroy$.next();
          }
          return;
        }

        if (record.flags?.length) {
          this.flagNotice.set(true);
        }

        if (
          record.status === 'identity_verified' ||
          record.status === 'in_progress' ||
          record.status === 'flagged'
        ) {
          this.step.set('identity_verified');
          this.destroy$.next();
        } else if (record.status === 'identity_rejected' || record.status === 'terminated') {
          this.step.set('identity_rejected');
          this.destroy$.next();
        }
      });
  }

  private async readRecord(): Promise<RemoteProctoringRecord | null> {
    try {
      const snap = await getDoc(
        doc(this.afs, `examSessions/${this.sessionId}/remoteProctoring/${this.candidateUid}`)
      );
      return snap.exists() ? (snap.data() as RemoteProctoringRecord) : null;
    } catch {
      return null;
    }
  }

  startExam(): void {
    this.adapter.unmountWidget();
    this.router.navigate(['/exam-session-remote-runner'], {
      queryParams: {
        sessionId: this.sessionId,
        examId: this.examId,
        candidateUid: this.candidateUid,
        token: this.token,
        mode: 'remote',
      },
    });
  }

  contactProctor(): void {
    this.router.navigate(['/exam-session-login'], { queryParams: { sessionId: this.sessionId } });
  }
}
