import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamSessionAuthService } from '../../../data/exam-session-auth.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Auth, signInAnonymously, signOut } from '@angular/fire/auth';

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
  private fbAuth = inject(Auth);

  sessionId = '';
  sessionInfo = signal<any | null>(null);

  email = signal('');
  password = signal('');

  loading = signal(false);
  error = signal('');
  submitted = signal(false);

  async ngOnInit(): Promise<void> {
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    if (!this.sessionId) {
      this.error.set('Missing session ID.');
      return;
    }

    if (this.route.snapshot.queryParamMap.get('submitted') === '1') {
      // Landed here straight from a completed exam — nothing left to log
      // in for, just show the confirmation and stop.
      this.submitted.set(true);
      return;
    }

    // This page has no logged-in candidate identity yet — establish (or
    // reset to) a clean anonymous session so the session-info read below
    // succeeds regardless of whatever was signed in in this browser
    // before. Mirrors kiosk-exam-login.ts, which needs the identical
    // pre-login read access for the same reason.
    try {
      if (this.fbAuth.currentUser && !this.fbAuth.currentUser.isAnonymous) {
        await signOut(this.fbAuth);
      }
      if (!this.fbAuth.currentUser) {
        await signInAnonymously(this.fbAuth);
      }
    } catch (e) {
      console.error('Anonymous sign-in failed:', e);
    }

    await this.loadSessionInfo();
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
      // Email -> uid resolution, enrollment check, and password
      // verification all happen server-side in loginToExamSession — see
      // ExamSessionAuthService.loginToSession for why.
      const token = await this.authService.loginToSession(this.sessionId, emailVal, pwVal);

      // Vendor-proctored (Talview) sessions skip the self-attested selfie
      // step entirely and go through the rigorous precheck flow instead —
      // no same-session fallback to self-verify if the vendor is
      // unreachable, since that would be a bypass for a flow meant to be
      // rigorous. Sessions without a vendor keep today's behavior.
      const targetRoute = this.sessionInfo()?.proctoringVendor === 'talview'
        ? '/exam-session-remote-precheck'
        : '/exam-session-proctor-verify';

      await this.router.navigate([targetRoute], {
        queryParams: {
          sessionId: this.sessionId,
          token: token.token,
          candidateUid: token.candidateUid,
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
