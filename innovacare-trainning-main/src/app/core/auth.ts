import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, sendPasswordResetEmail } from '@angular/fire/auth';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { BehaviorSubject, Subscription } from 'rxjs';

export type AppRole = 'super_admin' | 'manager' | 'admin' | 'learner' | 'guest';

export interface AppProfile {
  uid: string;
  email?: string;
  role: AppRole;
  orgId?: string | null;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private afs = inject(Firestore);

  private readySubject = new BehaviorSubject<boolean>(false);
  ready$ = this.readySubject.asObservable();

  private profileSubject = new BehaviorSubject<AppProfile | null>(null);
  profile$ = this.profileSubject.asObservable();

  private authSub?: Subscription;
  private profileSub?: Subscription;

  constructor() {
    this.authSub = authState(this.auth).subscribe((user) => {
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
        },
        error: () => {
          this.profileSubject.next(null);
          this.readySubject.next(true);
        }
      });
    });
  }

  async loginWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle() {
    return signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async logout() {
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
   resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }
}