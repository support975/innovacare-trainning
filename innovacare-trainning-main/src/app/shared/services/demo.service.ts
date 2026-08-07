import { Injectable, inject } from '@angular/core';
import { Auth, signInAnonymously, signInWithCustomToken } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';

interface StartDemoResponse {
  orgId: string;
  alreadyActive: boolean;
}

interface DemoSwitchResponse {
  token: string;
}

@Injectable({ providedIn: 'root' })
export class DemoService {
  private auth = inject(Auth);
  private functions = inject(Functions);

  /** Signs the visitor in anonymously (if needed) and provisions/reuses their demo org. */
  async start(): Promise<StartDemoResponse> {
    if (!this.auth.currentUser) {
      await signInAnonymously(this.auth);
    }
    const startDemo = httpsCallable<void, StartDemoResponse>(this.functions, 'startDemo');
    const result = await startDemo();
    return result.data;
  }

  /** Swaps the current auth session to the demo's admin or learner identity. */
  async switchTo(targetRole: 'admin' | 'learner'): Promise<void> {
    const demoSwitchIdentity = httpsCallable<{ targetRole: 'admin' | 'learner' }, DemoSwitchResponse>(
      this.functions,
      'demoSwitchIdentity'
    );
    const { data } = await demoSwitchIdentity({ targetRole });
    await signInWithCustomToken(this.auth, data.token);
  }
}
