import { Injectable, inject } from '@angular/core';
import {
  Auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';
import { UserProfile } from '../shared/models/training.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private db = inject(Firestore);

  private _profile$ = new BehaviorSubject<UserProfile | null>(null);
  profile$ = this._profile$.asObservable();

  private _ready$ = new BehaviorSubject<boolean>(false);
  ready$ = this._ready$.asObservable();

  constructor() {
    onAuthStateChanged(this.auth, async (u) => {
      if (!u) {
        this._profile$.next(null);
        this._ready$.next(true);
        return;
      }

      let role: UserProfile['role'] = 'learner';
      let displayName = u.displayName ?? undefined;

      try {
        const snap = await getDoc(doc(this.db, 'users', u.uid));
        const data: any = snap.exists() ? snap.data() : null;

        // Accept role either at root OR under meta.role
        role = (data?.role ?? data?.meta?.role ?? 'learner') as UserProfile['role'];

        // Prefer Firestore displayName if present
        displayName = (data?.displayName ?? displayName) as any;
      } catch {
        // keep fallback
      }

      this._profile$.next({
        uid: u.uid,
        role,
        email: u.email ?? undefined,
        displayName,
      });

      this._ready$.next(true);
    });
  }

  // -----------------------
  // Auth actions
  // -----------------------

  loginWithEmail(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(this.auth, provider);
  }

  logout() {
    return signOut(this.auth);
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }
}
