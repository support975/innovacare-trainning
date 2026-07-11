import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { ExamSessionAuthService } from '../../../data/exam-session-auth.service';

@Component({
  selector: 'app-exam-session-consent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exam-session-consent.html',
  styleUrls: ['./exam-session-consent.css'],
})
export class ExamSessionConsentComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private authService = inject(ExamSessionAuthService);

  sessionId = '';
  token = '';
  sessionInfo = signal<any | null>(null);
  examInfo = signal<any | null>(null);

  agreeConfidentiality = signal(false);
  agreeNoSharing = signal(false);
  agreeTerms = signal(false);

  loading = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';

    if (!this.sessionId || !this.token) {
      this.error.set('Missing session or token.');
      return;
    }

    this.loadSessionInfo();
  }

  private async loadSessionInfo(): Promise<void> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${this.sessionId}`);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        this.error.set('Session not found.');
        return;
      }

      const session = sessionSnap.data();
      this.sessionInfo.set(session);

      // Load exam info
      const examRef = doc(this.afs, `courses/${session['courseId']}/exams/${session['examId']}`);
      const examSnap = await getDoc(examRef);
      if (examSnap.exists()) {
        this.examInfo.set(examSnap.data());
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load session information.');
    }
  }

  readonly allAgreed = (): boolean => {
    return this.agreeConfidentiality() && this.agreeNoSharing() && this.agreeTerms();
  };

  async onStartExam(): Promise<void> {
    if (!this.allAgreed()) {
      this.error.set('You must agree to all terms before starting.');
      return;
    }

    this.loading.set(true);

    try {
      // Verify token is still valid
      const isValid = await this.authService.verifyToken(this.sessionId, this.token);
      if (!isValid) {
        this.error.set('Session token expired. Please log in again.');
        return;
      }

      // Navigate to exam runner with token and locked mode
      await this.router.navigate(
        [`/learner/courses/${this.sessionInfo()?.courseId}/exam/${this.sessionInfo()?.examId}`],
        {
          queryParams: {
            sessionId: this.sessionId,
            token: this.token,
            lockedMode: 'true',
          },
        }
      );
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to start exam.');
    } finally {
      this.loading.set(false);
    }
  }

  getDurationDisplay(): string {
    const session = this.sessionInfo();
    const exam = this.examInfo();
    const duration = session?.durationMinutes || exam?.durationMinutes;

    if (!duration) return 'Unknown';
    if (duration < 60) return `${duration} minutes`;
    if (duration === 60) return '1 hour';
    const hours = Math.floor(duration / 60);
    const mins = duration % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}
