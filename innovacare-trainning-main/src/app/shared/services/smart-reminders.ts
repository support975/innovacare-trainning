import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  addDoc,
  collection,
  doc,
  docData,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { Observable, filter, firstValueFrom, of, switchMap, timeout } from 'rxjs';
import { AppProfile, AuthService } from '../../core/auth';

export interface SmartReminderSettings {
  enabled: boolean;
  defaultDueDays: number;
  upcomingDueEnabled: boolean;
  upcomingDueDays: number;
  overdueEnabled: boolean;
  overdueEscalationDays: number;
  inactiveEnabled: boolean;
  inactiveDays: number;
  managerEscalationEnabled: boolean;
  digestMode: boolean;
  updatedAt?: any;
  updatedByUid?: string | null;
}

export interface SmartReminderScanResult {
  orgsScanned: number;
  learnerNotifications: number;
  managerNotifications: number;
  remindersCreated: number;
  skippedExisting: number;
}

type SmartReminderScanRequest = {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  result?: SmartReminderScanResult;
  error?: { message?: string };
};

export const DEFAULT_SMART_REMINDER_SETTINGS: SmartReminderSettings = {
  enabled: true,
  defaultDueDays: 30,
  upcomingDueEnabled: true,
  upcomingDueDays: 7,
  overdueEnabled: true,
  overdueEscalationDays: 3,
  inactiveEnabled: true,
  inactiveDays: 7,
  managerEscalationEnabled: true,
  digestMode: false,
};

@Injectable({ providedIn: 'root' })
export class SmartRemindersService {
  private readonly afs = inject(Firestore);
  private readonly authSvc = inject(AuthService);

  readonly settings$: Observable<SmartReminderSettings> = this.authSvc.profile$.pipe(
    filter((profile): profile is AppProfile => !!profile),
    switchMap(profile => {
      if (!profile.orgId) return of(DEFAULT_SMART_REMINDER_SETTINGS);
      const ref = doc(this.afs, `organizations/${profile.orgId}/settings/reminders`);
      return docData(ref) as Observable<SmartReminderSettings>;
    }),
    switchMap(settings => of({ ...DEFAULT_SMART_REMINDER_SETTINGS, ...(settings || {}) }))
  );

  async saveSettings(orgId: string, settings: SmartReminderSettings, actorUid?: string | null): Promise<void> {
    const ref = doc(this.afs, `organizations/${orgId}/settings/reminders`);
    await setDoc(
      ref,
      {
        ...settings,
        defaultDueDays: this.clamp(settings.defaultDueDays, 1, 365),
        upcomingDueDays: this.clamp(settings.upcomingDueDays, 1, 60),
        overdueEscalationDays: this.clamp(settings.overdueEscalationDays, 0, 60),
        inactiveDays: this.clamp(settings.inactiveDays, 1, 90),
        updatedAt: serverTimestamp(),
        updatedByUid: actorUid ?? null,
      },
      { merge: true }
    );
  }

  async runScanNow(orgId?: string | null): Promise<SmartReminderScanResult> {
    const profile = await firstValueFrom(this.authSvc.profile$.pipe(filter(Boolean), timeout(15000)));
    const requestRef = await addDoc(collection(this.afs, 'smartReminderScanRequests'), {
      status: 'pending',
      orgId: orgId ?? profile.orgId ?? null,
      requestedByUid: profile.uid,
      requestedByEmail: profile.email ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const request = await firstValueFrom(
      docData(requestRef).pipe(
        filter((doc): doc is SmartReminderScanRequest => {
          const status = (doc as SmartReminderScanRequest | undefined)?.status;
          return status === 'completed' || status === 'failed';
        }),
        timeout(120000)
      )
    );

    if (request.status === 'failed') {
      throw new Error(request.error?.message || 'Smart reminder scan failed.');
    }

    return request.result ?? {
      orgsScanned: 0,
      learnerNotifications: 0,
      managerNotifications: 0,
      remindersCreated: 0,
      skippedExisting: 0,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return min;
    return Math.max(min, Math.min(max, Math.round(normalized)));
  }
}
