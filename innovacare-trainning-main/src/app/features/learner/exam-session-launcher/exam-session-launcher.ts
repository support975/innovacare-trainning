import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, query, where, collectionData } from '@angular/fire/firestore';
import { interval, Subject, takeUntil, switchMap } from 'rxjs';
import { ExamSession } from '../../../data/models';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-exam-session-launcher',
  standalone: true,
  imports: [CommonModule, ToDatePipe],
  templateUrl: './exam-session-launcher.html',
  styleUrls: ['./exam-session-launcher.css'],
})
export class ExamSessionLauncherComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);

  sessionId = '';
  candidateUid = '';
  learnerEmail = '';
  token = '';

  session = signal<ExamSession | null>(null);
  learnerInfo = signal<any | null>(null);
  verificationStatus = signal<'pending' | 'verified' | 'rejected'>('pending');
  loading = signal(true);
  error = signal('');

  private destroy$ = new Subject<void>();
  pollingCount = 0;
  maxPollingAttempts = 60; // 5 minutes with 5-second intervals

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.candidateUid = this.route.snapshot.queryParamMap.get('candidateUid') || '';
    this.learnerEmail = this.route.snapshot.queryParamMap.get('learnerEmail') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (!this.sessionId || !this.candidateUid || !this.token) {
      this.error.set('Invalid session. Please log in again.');
      return;
    }

    this.loadSessionData();
    this.loadLearnerInfo();
    this.startVerificationPolling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadSessionData(): Promise<void> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${this.sessionId}`);
      const snap = await getDoc(sessionRef);

      if (snap.exists()) {
        this.session.set(snap.data() as ExamSession);
      } else {
        this.error.set('Session not found.');
      }
    } catch (e: any) {
      this.error.set('Failed to load session data.');
      console.error(e);
    }
  }

  private async loadLearnerInfo(): Promise<void> {
    try {
      const userRef = doc(this.afs, `users/${this.candidateUid}`);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        this.learnerInfo.set(snap.data());
      } else {
        this.learnerInfo.set({ email: this.learnerEmail });
      }
    } catch (e: any) {
      console.error('Failed to load learner info:', e);
      this.learnerInfo.set({ email: this.learnerEmail });
    }
  }

  private startVerificationPolling(): void {
    interval(5000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.checkVerificationStatus())
      )
      .subscribe({
        next: (status) => {
          this.verificationStatus.set(status);
          this.pollingCount++;

          if (status === 'verified') {
            this.loading.set(false);
          } else if (status === 'rejected') {
            this.error.set('Your identity verification was rejected. Please try again.');
            this.destroy$.next();
          } else if (this.pollingCount >= this.maxPollingAttempts) {
            this.error.set('Verification timeout. Please contact the proctor.');
            this.destroy$.next();
          }
        },
        error: (err) => {
          console.error('Verification polling error:', err);
        },
      });
  }

  private checkVerificationStatus(): Promise<'pending' | 'verified' | 'rejected'> {
    return new Promise((resolve) => {
      const verificationRef = doc(
        this.afs,
        `examSessions/${this.sessionId}/candidateVerifications/${this.candidateUid}`
      );

      getDoc(verificationRef)
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            if (data.verified === true) {
              resolve('verified');
            } else if (data.verified === false) {
              resolve('rejected');
            } else {
              resolve('pending');
            }
          } else {
            resolve('pending');
          }
        })
        .catch(() => resolve('pending'));
    });
  }

  startExam(): void {
    if (!this.session()) {
      this.error.set('Session data not loaded.');
      return;
    }

    const session = this.session()!;
    this.router.navigate(['/exam-session-runner'], {
      queryParams: {
        sessionId: this.sessionId,
        examId: session.examId,
        candidateUid: this.candidateUid,
        token: this.token,
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/exam-session-login']);
  }
}
