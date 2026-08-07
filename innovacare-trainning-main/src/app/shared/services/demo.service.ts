import { Injectable, inject } from '@angular/core';
import { Auth, signInAnonymously } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';

interface StartDemoResponse {
  orgId: string;
  alreadyActive: boolean;
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
}
