import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LicenseDoc, UserDirectoryService, UserDoc } from '../../../../shared/services/user-directory';
import { LanguageService } from '../../../../shared/services/language';


function epochMs(x: any): number | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') { const t = Date.parse(x); return isNaN(t) ? undefined : t; }
  if (typeof x === 'number') return x;
  if (typeof x?.toMillis === 'function') return x.toMillis();
  if (typeof x?.toDate === 'function') return +x.toDate();
  return undefined;
}
function fmtShort(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleDateString(); } catch { return '—'; }
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePage {
  private fb = inject(FormBuilder);
  private dir = inject(UserDirectoryService);
  private languageService = inject(LanguageService);

  readonly t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);

  tab = signal<'profile'|'licenses'>('profile');
  busy = signal(false);
  notice = signal('');

  user = toSignal(this.dir.user$(), { initialValue: null as UserDoc | null });
  licenses = toSignal(this.dir.licenses$(), { initialValue: [] as LicenseDoc[] });

  // Only edit fields you truly want editable (won't break your schema)
  profileForm = this.fb.group({
    displayName: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    email: this.fb.control('', { nonNullable: true }),
    phone: this.fb.control('', { nonNullable: true }),
    address: this.fb.control('', { nonNullable: true }),
    profileImage: this.fb.control('', { nonNullable: true }),
  });

  licenseForm = this.fb.group({
    id: this.fb.control('', { nonNullable: true }),
    state: this.fb.control('GA', { nonNullable: true, validators: [Validators.required] }),
    type: this.fb.control('Registered Nurse (RN)', { nonNullable: true, validators: [Validators.required] }),
    number: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    renewalDate: this.fb.control('', { nonNullable: true }), // YYYY-MM-DD
    renewalPeriodMonths: this.fb.control(12, { nonNullable: true }),
    hours: this.fb.control(0, { nonNullable: true }),
    reminderWeeks: this.fb.control(8, { nonNullable: true }),
  });

  licensesView = computed(() => {
    const rows = [...this.licenses()];
    return rows.sort((a, b) => (epochMs(a.renewalDate) ?? 9e15) - (epochMs(b.renewalDate) ?? 9e15));
  });

  constructor() {
    // hydrate form when user loads
    queueMicrotask(() => this.hydrate());
  }

  hydrate() {
    const u = this.user();
    if (!u) return;
    this.profileForm.patchValue({
      displayName: u.displayName ?? '',
      email: u.email ?? '',
      phone: u.phone ?? '',
      address: u.address ?? '',
      profileImage: u.profileImage ?? '',
    }, { emitEvent: false });
  }

  setTab(t: 'profile'|'licenses') {
    this.tab.set(t);
    this.notice.set('');
    if (t === 'profile') queueMicrotask(() => this.hydrate());
  }

  async saveProfile() {
    if (this.profileForm.invalid) {
      this.notice.set('Please complete required fields.');
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      await this.dir.updateUser(this.profileForm.getRawValue());
      this.notice.set('Profile saved.');
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to save profile.');
    } finally {
      this.busy.set(false);
    }
  }

  newLicense() {
    this.licenseForm.reset({
      id: '',
      state: 'GA',
      type: 'Registered Nurse (RN)',
      number: '',
      renewalDate: '',
      renewalPeriodMonths: 12,
      hours: 0,
      reminderWeeks: 8,
    });
  }

  editLicense(r: LicenseDoc) {
    const dMs = epochMs(r.renewalDate);
    const ymd = dMs ? new Date(dMs).toISOString().slice(0, 10) : '';
    this.licenseForm.patchValue({
      id: r.id ?? '',
      state: r.state ?? 'GA',
      type: r.type ?? 'Registered Nurse (RN)',
      number: r.number ?? '',
      renewalDate: ymd,
      renewalPeriodMonths: Number(r.renewalPeriodMonths ?? 12),
      hours: Number(r.hours ?? 0),
      reminderWeeks: Number(r.reminderWeeks ?? 8),
    });
  }

  async saveLicense() {
    if (this.licenseForm.invalid) {
      this.notice.set('State, Type, and Number are required.');
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      const v = this.licenseForm.getRawValue();
      const renewalDate = v.renewalDate ? new Date(v.renewalDate).toISOString() : undefined;

      if (v.id) {
        await this.dir.updateLicense(v.id, {
          state: v.state, type: v.type, number: v.number,
          renewalDate,
          renewalPeriodMonths: v.renewalPeriodMonths,
          hours: v.hours,
          reminderWeeks: v.reminderWeeks,
        });
        this.notice.set('License updated.');
      } else {
        await this.dir.addLicense({
          state: v.state, type: v.type, number: v.number,
          renewalDate,
          renewalPeriodMonths: v.renewalPeriodMonths,
          hours: v.hours,
          reminderWeeks: v.reminderWeeks,
        });
        this.notice.set('License added.');
      }
      this.newLicense();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to save license.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteLicense(id: string) {
    this.busy.set(true);
    this.notice.set('');
    try {
      await this.dir.deleteLicense(id);
      this.notice.set('License deleted.');
      this.newLicense();
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to delete license.');
    } finally {
      this.busy.set(false);
    }
  }

  fmtRenewal(x: any) { return fmtShort(epochMs(x)); }
}
