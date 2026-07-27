import { Injectable, computed, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

export interface MaintenanceSettings {
  bannerEnabled: boolean;
  bannerMessage: string;
  blockEnabled: boolean;
  blockMessage: string;
  estimatedReturnAt: any | null;
}

const DEFAULTS: MaintenanceSettings = {
  bannerEnabled: false,
  bannerMessage: '',
  blockEnabled: false,
  blockMessage: "We're currently performing scheduled maintenance. Please check back shortly.",
  estimatedReturnAt: null,
};

/**
 * Platform-wide maintenance status, readable by anyone (even signed out —
 * the app needs to know before login whether it should show the full block
 * screen). Write is super-admin only, gated by firestore.rules.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly afs = inject(Firestore);
  private readonly ref = doc(this.afs, 'platformSettings/maintenance');

  private readonly settings = toSignal(
    docData(this.ref).pipe(
      map((data) => ({ ...DEFAULTS, ...(data as Partial<MaintenanceSettings> | undefined) })),
    ),
    { initialValue: DEFAULTS }
  );

  readonly raw = this.settings;
  readonly bannerEnabled = computed(() => this.settings().bannerEnabled === true);
  readonly bannerMessage = computed(() => this.settings().bannerMessage);
  readonly blockEnabled = computed(() => this.settings().blockEnabled === true);
  readonly blockMessage = computed(() => this.settings().blockMessage);
  readonly estimatedReturnAt = computed(() => this.settings().estimatedReturnAt ?? null);

  async save(patch: Partial<MaintenanceSettings>, actorUid: string): Promise<void> {
    await setDoc(
      this.ref,
      {
        ...patch,
        updatedAt: serverTimestamp(),
        updatedByUid: actorUid,
      },
      { merge: true }
    );
  }
}
