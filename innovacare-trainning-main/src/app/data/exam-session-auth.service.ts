import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

export interface ExamSessionToken {
  sessionId: string;
  candidateUid: string;
  token: string;
  expiresAt: number; // unix timestamp
}

const STORAGE_KEY = 'exam_session_token';
const TOKEN_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

@Injectable({ providedIn: 'root' })
export class ExamSessionAuthService {
  private afs = inject(Firestore);

  private tokenSubject = new BehaviorSubject<ExamSessionToken | null>(this.loadTokenFromStorage());
  token$ = this.tokenSubject.asObservable();

  constructor() {
    // Cleanup expired token on init
    const token = this.loadTokenFromStorage();
    if (token && token.expiresAt < Date.now()) {
      this.clearToken();
    }
  }

  /** Authenticate learner for a session using ID + password */
  async loginToSession(
    sessionId: string,
    candidateUid: string,
    firstName: string,
    lastName: string,
    password: string
  ): Promise<ExamSessionToken> {
    try {
      // Fetch session
      const sessionRef = doc(this.afs, `examSessions/${sessionId}`);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Session not found.');
      }

      const session = sessionSnap.data() as any;

      // Verify enrolled candidate
      if (!session.enrolledCandidateIds?.includes(candidateUid)) {
        throw new Error('You are not enrolled in this session.');
      }

      // Verify password (simple comparison - production should use bcrypt)
      if (session.accessPassword !== this.simpleHash(password)) {
        throw new Error('Invalid password.');
      }

      // Generate token
      const token = this.generateToken();
      const expiresAt = Date.now() + TOKEN_DURATION_MS;

      // Store token in session document
      await updateDoc(sessionRef, {
        accessTokens: arrayUnion({
          candidateUid,
          token,
          issuedAt: serverTimestamp(),
          expiresAt: new Date(expiresAt),
        }),
      });

      const sessionToken: ExamSessionToken = {
        sessionId,
        candidateUid,
        token,
        expiresAt,
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

  private generateToken(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  private simpleHash(password: string): string {
    // Production: use bcrypt via Cloud Function
    // This is simplified for demo
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(36);
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
