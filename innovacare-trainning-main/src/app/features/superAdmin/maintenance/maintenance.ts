import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth';
import { MaintenanceService } from '../../../core/maintenance.service';

function toDatetimeLocal(value: any): string {
  if (!value) return '';
  const raw = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value?.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value);
  if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}T${pad(raw.getHours())}:${pad(raw.getMinutes())}`;
}

@Component({
  selector: 'app-maintenance-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './maintenance.html',
  styleUrl: './maintenance.css',
})
export class MaintenanceSettingsPage {
  private readonly authSvc = inject(AuthService);
  private readonly maintenanceSvc = inject(MaintenanceService);

  bannerNotice = signal('');
  bannerError = signal(false);
  bannerSaving = signal(false);

  blockNotice = signal('');
  blockError = signal(false);
  blockSaving = signal(false);

  banner = {
    enabled: this.maintenanceSvc.bannerEnabled(),
    message: this.maintenanceSvc.bannerMessage(),
  };

  block = {
    enabled: this.maintenanceSvc.blockEnabled(),
    message: this.maintenanceSvc.blockMessage(),
    estimatedReturnAt: toDatetimeLocal(this.maintenanceSvc.estimatedReturnAt()),
  };

  private currentUid(): string {
    return this.authSvc.currentUid ?? 'unknown';
  }

  async saveBanner() {
    this.bannerNotice.set('');
    this.bannerSaving.set(true);
    try {
      await this.maintenanceSvc.save(
        { bannerEnabled: this.banner.enabled, bannerMessage: this.banner.message },
        this.currentUid()
      );
      this.bannerNotice.set('Banner settings saved.');
      this.bannerError.set(false);
    } catch (e: any) {
      this.bannerNotice.set(e?.message || 'Failed to save banner settings.');
      this.bannerError.set(true);
    } finally {
      this.bannerSaving.set(false);
    }
  }

  async saveBlock() {
    this.blockNotice.set('');
    this.blockSaving.set(true);
    try {
      const estimatedReturnAt = this.block.estimatedReturnAt
        ? new Date(this.block.estimatedReturnAt)
        : null;
      await this.maintenanceSvc.save(
        { blockEnabled: this.block.enabled, blockMessage: this.block.message, estimatedReturnAt },
        this.currentUid()
      );
      this.blockNotice.set('Maintenance block settings saved.');
      this.blockError.set(false);
    } catch (e: any) {
      this.blockNotice.set(e?.message || 'Failed to save maintenance block settings.');
      this.blockError.set(true);
    } finally {
      this.blockSaving.set(false);
    }
  }
}
