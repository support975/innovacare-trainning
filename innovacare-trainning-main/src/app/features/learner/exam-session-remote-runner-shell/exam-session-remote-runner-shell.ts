import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { LanguageService } from '../../../shared/services/language';
import { REMOTE_PROCTORING_ADAPTER } from '../../../data/remote-proctoring-adapter';
import { BlueprintExamRunnerComponent } from '../official-certifications/blueprint-exam-runner';

/**
 * Thin wrapper mounted alongside <app-blueprint-exam-runner> for remote
 * (mode=remote, vendor-proctored) sessions only. Keeps vendor SDK/widget
 * code out of the exam-runner component itself — this shell only gates
 * entry (nothing renders until the proctoring record is confirmed active)
 * and keeps a persistent monitoring indicator + flag banner alive for the
 * duration of the exam. BlueprintExamRunnerComponent is rendered directly
 * (not via a nested router-outlet) so it reads the same query params from
 * this route's ActivatedRoute — kiosk sessions never go through this shell
 * and keep routing straight to BlueprintExamRunnerComponent unchanged.
 */
@Component({
  selector: 'app-exam-session-remote-runner-shell',
  standalone: true,
  imports: [CommonModule, BlueprintExamRunnerComponent],
  templateUrl: './exam-session-remote-runner-shell.html',
  styleUrls: ['./exam-session-remote-runner-shell.css'],
})
export class ExamSessionRemoteRunnerShellComponent implements OnInit, OnDestroy {
  @ViewChild('widgetContainer') widgetContainer?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly afs = inject(Firestore);
  private readonly adapter = inject(REMOTE_PROCTORING_ADAPTER);
  readonly lang = inject(LanguageService);

  readonly ready = signal(false);
  readonly latestFlagSeverity = signal<'low' | 'medium' | 'high' | null>(null);

  private sessionId = '';
  private candidateUid = '';
  private vendorSessionId = '';

  async ngOnInit(): Promise<void> {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.candidateUid = this.route.snapshot.queryParamMap.get('candidateUid') || '';

    if (this.sessionId && this.candidateUid) {
      const snap = await getDoc(
        doc(this.afs, `examSessions/${this.sessionId}/remoteProctoring/${this.candidateUid}`)
      );
      this.vendorSessionId = (snap.data()?.['vendorSessionId'] as string) || '';
    }

    this.adapter.onFlag((flag) => this.latestFlagSeverity.set(flag.severity));

    queueMicrotask(() => {
      if (this.widgetContainer && this.vendorSessionId) {
        void this.adapter.mountWidget(this.widgetContainer.nativeElement, {
          vendorSessionId: this.vendorSessionId,
          launchToken: '',
          sdkConfig: {},
        });
      }
    });

    this.ready.set(true);
  }

  ngOnDestroy(): void {
    if (this.vendorSessionId) {
      void this.adapter.endSession(this.vendorSessionId);
    }
    this.adapter.unmountWidget();
  }
}
