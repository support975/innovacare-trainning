import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  authState,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import { Firestore, doc, docData, increment, serverTimestamp, setDoc, updateDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Subscription } from 'rxjs';

export type AppRole = 'super_admin' | 'manager' | 'admin' | 'learner' | 'proctor' | 'guest';

export interface AppProfile {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  profileImage?: string;
  role: AppRole;
  orgId?: string | null;
  orgType?: string | null;
  active?: boolean;
  permissions?: string[];
  accountType?: 'organization' | 'individual' | 'guest';
  onboardingSource?: string;
}

export interface IndividualLearnerRegistration {
  displayName: string;
  email: string;
  password: string;
  orgId?: string | null;
}

const PRESENCE_HEARTBEAT_MS = 60_000;
const MAX_HEARTBEAT_SECONDS = 5 * 60;

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private auth = inject(Auth);
  private afs = inject(Firestore);

  private readySubject = new BehaviorSubject<boolean>(false);
  ready$ = this.readySubject.asObservable();

  private profileSubject = new BehaviorSubject<AppProfile | null>(null);
  profile$ = this.profileSubject.asObservable();

  private authSub?: Subscription;
  private profileSub?: Subscription;
  private presenceUid: string | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private presenceLastFlushAt = 0;
  private visibilityHandler = () => {
    if (document.visibilityState === 'hidden') {
      void this.flushPresence();
    } else if (this.presenceUid) {
      this.presenceLastFlushAt = Date.now();
      void this.touchPresence(false, 0);
    }
  };
  private pageHideHandler = () => {
    void this.flushPresence();
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.pageHideHandler);
    }

    this.authSub = authState(this.auth).subscribe((user) => {
      void this.stopPresence();

      // reset immediately on any auth change
      this.readySubject.next(false);
      this.profileSubject.next(null);

      // stop previous profile listener
      this.profileSub?.unsubscribe();
      this.profileSub = undefined;

      if (!user) {
        this.readySubject.next(true);
        return;
      }

      const ref = doc(this.afs, `users/${user.uid}`);
      this.profileSub = docData(ref, { idField: 'uid' }).subscribe({
        next: (profile: any) => {
          this.profileSubject.next(profile ? profile as AppProfile : null);
          this.readySubject.next(true);
          if (profile) {
            void this.startPresence(user.uid);
          }
        },
        error: () => {
          this.profileSubject.next(null);
          this.readySubject.next(true);
        }
      });
    });
  }

  async loginWithEmail(email: string, password: string, orgId?: string) {
    const result = await signInWithEmailAndPassword(this.auth, email, password);

    // If organization ID is provided, update user profile with organization context
    if (orgId && result.user.uid) {
      try {
        await updateDoc(doc(this.afs, `users/${result.user.uid}`), {
          orgId,
          lastLoginAt: serverTimestamp(),
        });
      } catch (e) {
        // If user document doesn't exist yet, create it
        await setDoc(doc(this.afs, `users/${result.user.uid}`), {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName || '',
          role: 'learner',
          orgId,
          active: true,
          accountType: 'organization',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        }, { merge: true });
      }
    }

    return result;
  }

  async loginWithGoogle() {
    return signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async registerIndividualLearner(input: IndividualLearnerRegistration): Promise<User> {
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const credential = await createUserWithEmailAndPassword(this.auth, email, input.password);

    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }

    await setDoc(doc(this.afs, `users/${credential.user.uid}`), {
      uid: credential.user.uid,
      email: credential.user.email ?? email,
      displayName,
      role: 'learner' satisfies AppRole,
      active: true,
      orgId: input.orgId ?? null,
      orgType: null,
      accountType: 'individual',
      onboardingSource: 'public-self-serve',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      activityUpdatedAt: serverTimestamp(),
      totalAppSeconds: 0,
    });

    return credential.user;
  }

  async logout() {
    await this.stopPresence();

    // reset local state first
    this.readySubject.next(false);
    this.profileSubject.next(null);
    this.profileSub?.unsubscribe();
    this.profileSub = undefined;

    await signOut(this.auth);

    // authState(null) will set ready=true
  }

  get currentUid(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  ngOnDestroy(): void {
    void this.stopPresence();
    this.authSub?.unsubscribe();
    this.profileSub?.unsubscribe();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pageHideHandler);
    }
  }

  private async startPresence(uid: string): Promise<void> {
    if (this.presenceUid === uid) return;

    await this.stopPresence();
    this.presenceUid = uid;
    this.presenceLastFlushAt = Date.now();
    await this.touchPresence(true, 0);

    this.presenceTimer = setInterval(() => {
      void this.flushPresence();
    }, PRESENCE_HEARTBEAT_MS);
  }

  private async stopPresence(): Promise<void> {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }

    await this.flushPresence();
    this.presenceUid = null;
    this.presenceLastFlushAt = 0;
  }

  private async flushPresence(): Promise<void> {
    if (!this.presenceUid || !this.presenceLastFlushAt) return;

    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.round((now - this.presenceLastFlushAt) / 1000));
    if (elapsedSeconds < 5) return;

    this.presenceLastFlushAt = now;
    await this.touchPresence(false, Math.min(elapsedSeconds, MAX_HEARTBEAT_SECONDS));
  }

  private async touchPresence(includeLogin: boolean, elapsedSeconds: number): Promise<void> {
    if (!this.presenceUid) return;

    const patch: Record<string, unknown> = {
      lastSeenAt: serverTimestamp(),
      activityUpdatedAt: serverTimestamp(),
    };

    if (includeLogin) {
      patch['lastLoginAt'] = serverTimestamp();
    }

    if (elapsedSeconds > 0) {
      patch['totalAppSeconds'] = increment(elapsedSeconds);
    }

    try {
      await updateDoc(doc(this.afs, `users/${this.presenceUid}`), patch);
    } catch (error) {
      console.warn('Unable to update user analytics presence.', error);
    }
  }
   resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }
}
