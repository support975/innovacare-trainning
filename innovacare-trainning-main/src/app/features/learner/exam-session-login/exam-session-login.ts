import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamSessionAuthService } from '../../../data/exam-session-auth.service';
import { Firestore, doc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';

@Component({
  selector: 'app-exam-session-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exam-session-login.html',
  styleUrls: ['./exam-session-login.css'],
})
export class ExamSessionLoginComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(ExamSessionAuthService);
  private afs = inject(Firestore);

  sessionId = '';
  sessionInfo = signal<any | null>(null);

  email = signal('');
  password = signal('');

  loading = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    if (!this.sessionId) {
      this.error.set('Missing session ID.');
      return;
    }

    this.loadSessionInfo();
  }

  private async loadSessionInfo(): Promise<void> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${this.sessionId}`);
      const snap = await getDoc(sessionRef);

      if (!snap.exists()) {
        this.error.set('Session not found.');
        return;
      }

      this.sessionInfo.set(snap.data());
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to load session.');
    }
  }

  async onLogin(): Promise<void> {
    const emailVal = this.email().trim();
    const pwVal = this.password().trim();

    if (!emailVal || !pwVal) {
      this.error.set('Please enter email and password.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // Look up learner by email to verify enrollment
      const usersQuery = query(
        collection(this.afs, 'users'),
        where('email', '==', emailVal)
      );
      const userSnap = await getDocs(usersQuery);

      if (userSnap.empty) {
        this.error.set('Email not found. Please check and try again.');
        this.loading.set(false);
        return;
      }

      const learner = userSnap.docs[0].data();
      const candidateUid = userSnap.docs[0].id;

      // Verify candidate is enrolled in this session
      const sessionData = this.sessionInfo();
      if (!sessionData?.enrolledCandidateIds?.includes(candidateUid)) {
        this.error.set('You are not enrolled in this exam session.');
        this.loading.set(false);
        return;
      }

      // Authenticate with session
      const token = await this.authService.loginToSession(
        this.sessionId,
        candidateUid,
        learner['displayName'] || emailVal,
        emailVal,
        pwVal
      );

      // Navigate to proctor verification (with learner info for verification)
      await this.router.navigate(['/exam-session-proctor-verify'], {
        queryParams: {
          sessionId: this.sessionId,
          token: token.token,
          candidateUid: candidateUid,
          learnerEmail: emailVal,
        },
      });
    } catch (e: any) {
      this.error.set(e?.message || 'Login failed.');
    } finally {
      this.loading.set(false);
    }
  }
}
