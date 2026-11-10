import { Component, OnDestroy, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, addDoc, serverTimestamp } from '@angular/fire/firestore';
import { Auth, signInAnonymously, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { ExamSession } from '../../../data/models';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-kiosk-exam-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ToDatePipe],
  templateUrl: './kiosk-exam-login.html',
  styleUrls: ['./kiosk-exam-login.css'],
})
export class KioskExamLoginComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private afs = inject(Firestore);
  private fbAuth = inject(Auth);
  private destroyRef = inject(DestroyRef);

  sessionId = '';
  stationNumber = '';
  session = signal<ExamSession | null>(null);

  email = '';
  password = '';

  loading = signal(false);
  error = signal('');
  notice = signal('');

  // Disclaimer step between login and exam start
  disclaimerVisible = signal(false);
  disclaimerLang = signal<'en' | 'fr'>('en');
  agreed = false;
  private pendingCandidate: any = null;

  setDisclaimerLang(lang: 'en' | 'fr'): void {
    this.disclaimerLang.set(lang);
  }

  // Kiosk stations are locked to this page: swallow back/forward navigation
  private blockHistoryNav = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.href);
    }
  };

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') || '';
    this.stationNumber = this.route.snapshot.paramMap.get('stationId') || '';

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', this.blockHistoryNav);
    }

    if (!this.sessionId) {
      this.error.set('Invalid session.');
      return;
    }

    void this.init();
  }

  private async init(): Promise<void> {
    try {
      // A previous candidate (or staff member) may still be signed in on this
      // station — always reset to a clean anonymous kiosk session.
      if (this.fbAuth.currentUser && !this.fbAuth.currentUser.isAnonymous) {
        await signOut(this.fbAuth);
      }
      if (!this.fbAuth.currentUser) {
        await signInAnonymously(this.fbAuth);
      }
    } catch (e) {
      console.error('Anonymous sign-in failed:', e);
      this.error.set('Unable to initialize the exam station. Please contact the proctor.');
      return;
    }

    await this.loadSession();
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.blockHistoryNav);
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${this.sessionId}`);
      const snap = await getDoc(sessionRef);

      if (snap.exists()) {
        this.session.set(snap.data() as ExamSession);
      } else {
        this.error.set('Session not found.');
      }
    } catch (e: any) {
      this.error.set('Failed to load session.');
      console.error(e);
    }
  }

  async login(): Promise<void> {
    if (!this.email || !this.password) {
      this.error.set('Please enter email and password.');
      return;
    }

    if (!this.sessionId) {
      this.error.set('Session not found.');
      return;
    }

    const session = this.session();
    if (!session) {
      this.error.set('Session not found.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      // 1) Real authentication: the enrollment email IS the candidate's
      //    account email. On success the station is signed in AS the
      //    candidate for the duration of the exam.
      let candidateUid = '';
      try {
        const cred = await signInWithEmailAndPassword(this.fbAuth, this.email.trim(), this.password);
        candidateUid = cred.user.uid;
      } catch (authErr: any) {
        const code = authErr?.code || '';
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
          this.error.set('Incorrect email or password. Please use your account password.');
        } else if (code === 'auth/too-many-requests') {
          this.error.set('Too many failed attempts. Please wait a moment and try again.');
        } else if (code === 'auth/user-not-found') {
          this.error.set('No account exists for this email. Please contact the proctor.');
        } else {
          this.error.set('Authentication failed. Please contact the proctor.');
        }
        await this.resetStation();
        return;
      }

      // 2) Only now read this candidate's own verification record — the
      //    station never sees other candidates' details.
      const snap = await getDoc(
        doc(this.afs, `examSessions/${this.sessionId}/candidateVerifications/${candidateUid}`)
      );
      const record = snap.exists() ? (snap.data() as any) : null;

      let refusal = '';
      if (!record) {
        refusal = 'You are not registered for this session. Please ask the proctor to verify your identity first.';
      } else if (record['examCompleted'] === true) {
        refusal = 'This exam has already been completed. Each verification allows one attempt only.';
      } else if (record['candidacyApproved'] === false) {
        refusal = 'Your candidacy was not approved for this session. Please contact the proctor.';
      } else if (record['verified'] !== true) {
        refusal = 'Your identity has not been verified. Please ask the proctor to verify you first.';
      }
      if (refusal) {
        this.error.set(refusal);
        await this.resetStation();
        return;
      }

      // Credentials accepted — show the exam rules disclaimer before starting
      this.pendingCandidate = {
        uid: candidateUid,
        email: record['email'] || this.fbAuth.currentUser?.email || this.email.trim(),
        name: record['displayName'] || this.fbAuth.currentUser?.displayName || 'Candidate',
      };
      this.agreed = false;
      this.error.set('');
      this.disclaimerVisible.set(true);
    } catch (e: any) {
      this.error.set(e?.message || 'Login failed. Please try again.');
      await this.resetStation();
    } finally {
      this.loading.set(false);
    }
  }

  /** Sign any candidate out and return the station to its anonymous session. */
  private async resetStation(): Promise<void> {
    this.password = '';
    try {
      if (this.fbAuth.currentUser && !this.fbAuth.currentUser.isAnonymous) {
        await signOut(this.fbAuth);
      }
      if (!this.fbAuth.currentUser) {
        await signInAnonymously(this.fbAuth);
      }
    } catch (e) {
      console.error('Failed to reset kiosk auth:', e);
    }
  }

  async startExam(): Promise<void> {
    const candidate = this.pendingCandidate;
    const session = this.session();
    if (!candidate || !session || !this.agreed) return;

    this.loading.set(true);
    try {
      // Audit trail: record that this candidate accepted the exam rules
      try {
        await addDoc(collection(this.afs, `examSessions/${this.sessionId}/ruleAgreements`), {
          candidateUid: candidate.uid,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          stationId: this.stationNumber,
          examId: session.examId,
          agreedAt: serverTimestamp(),
          language: this.disclaimerLang(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        });
      } catch (e) {
        // Don't block the exam on a failed audit write, but keep a trace
        console.error('Failed to record rule agreement:', e);
      }

      // Generate temporary token for exam access
      const token = this.generateToken(candidate.uid);

      // Navigate directly to exam runner (skip launcher).
      // replaceUrl keeps the login page out of the browser history so the
      // back button cannot leave the exam.
      await this.router.navigate(['/exam-session-runner'], {
        queryParams: {
          sessionId: this.sessionId,
          examId: session.examId,
          candidateUid: candidate.uid,
          email: candidate.email,
          name: candidate.name,
          stationId: this.stationNumber,
          token,
          mode: 'kiosk',
        },
        replaceUrl: true,
      });
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to start the exam. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async declineDisclaimer(): Promise<void> {
    this.disclaimerVisible.set(false);
    this.pendingCandidate = null;
    this.agreed = false;
    this.email = '';
    this.password = '';
    this.error.set('');
    // Sign the candidate out and return the station to its anonymous session
    try {
      await signOut(this.fbAuth);
      await signInAnonymously(this.fbAuth);
    } catch (e) {
      console.error('Failed to reset kiosk auth:', e);
    }
  }

  private generateToken(uid: string): string {
    // Simple token generation (in real app, use proper JWT)
    return 'token_' + uid + '_' + Date.now();
  }

  clearForm(): void {
    this.email = '';
    this.password = '';
    this.error.set('');
  }
}
