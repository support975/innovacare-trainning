import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { Auth, signInWithCustomToken } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { BehaviorSubject } from 'rxjs';

export interface ExamSessionToken {
  sessionId: string;
  candidateUid: string;
  token: string;
  expiresAt: number; // unix timestamp
}

const STORAGE_KEY = 'exam_session_token';

interface LoginToExamSessionResponse {
  candidateUid: string;
  token: string;
  expiresAt: number;
  customToken: string;
}

@Injectable({ providedIn: 'root' })
export class ExamSessionAuthService {
  private afs = inject(Firestore);
  private fbAuth = inject(Auth);
  private functions = inject(Functions);

  private tokenSubject = new BehaviorSubject<ExamSessionToken | null>(this.loadTokenFromStorage());
  token$ = this.tokenSubject.asObservable();

  constructor() {
    // Cleanup expired token on init
    const token = this.loadTokenFromStorage();
    if (token && token.expiresAt < Date.now()) {
      this.clearToken();
    }
  }

  /**
   * Authenticate a candidate for a session using their email + the
   * session's shared password. Resolving email to a uid, verification, and
   * the access-token write all happen server-side (loginToExamSession) —
   * the candidate has no pre-existing Firebase Auth session for
   * request.auth.uid to match, and firestore.rules never lets a bare
   * client query other users' profiles by email. The callable also
   * returns a custom token so we can sign in as the candidate here,
   * giving everything downstream (remote proctoring, exam submission) a
   * real, matching request.auth.uid.
   */
  async loginToSession(sessionId: string, email: string, password: string): Promise<ExamSessionToken> {
    try {
      const callable = httpsCallable<
        { sessionId: string; email: string; password: string },
        LoginToExamSessionResponse
      >(this.functions, 'loginToExamSession');
      const result = await callable({ sessionId, email, password });

      await signInWithCustomToken(this.fbAuth, result.data.customToken);

      const sessionToken: ExamSessionToken = {
        sessionId,
        candidateUid: result.data.candidateUid,
        token: result.data.token,
        expiresAt: result.data.expiresAt,
      };

      this.storeToken(sessionToken);
      this.tokenSubject.next(sessionToken);

      return sessionToken;
    } catch (e: any) {
      throw new Error(e?.message || 'Failed to authenticate to session.');
    }
  }

  /** Verify if token is valid for this session */
  async verifyToken(sessionId: string, token: string): Promise<boolean> {
    try {
      const sessionRef = doc(this.afs, `examSessions/${sessionId}`);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) return false;

      const session = sessionSnap.data() as any;
      const tokens = session.accessTokens || [];

      const validToken = tokens.find((t: any) => {
        const expiresAt = t.expiresAt.toMillis ? t.expiresAt.toMillis() : new Date(t.expiresAt).getTime();
        return t.token === token && expiresAt > Date.now();
      });

      return !!validToken;
    } catch {
      return false;
    }
  }

  /** Get current token */
  getCurrentToken(): ExamSessionToken | null {
    return this.tokenSubject.value;
  }

  /** Clear token on logout or exam end */
  clearToken(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.tokenSubject.next(null);
  }

  private storeToken(token: ExamSessionToken): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  }

  private loadTokenFromStorage(): ExamSessionToken | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /** Generate password for admin (simplified) */
  generateAccessPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
