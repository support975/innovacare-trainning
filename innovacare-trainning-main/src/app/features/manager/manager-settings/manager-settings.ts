import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth';
import {
  DEFAULT_SMART_REMINDER_SETTINGS,
  SmartReminderSettings,
  SmartRemindersService,
} from '../../../shared/services/smart-reminders';

@Component({
  selector: 'app-manager-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-settings.html',
  styleUrl: './manager-settings.css',
})
export class ManagerSettings {
  private readonly authSvc = inject(AuthService);
  private readonly remindersSvc = inject(SmartRemindersService);
  private readonly destroyRef = inject(DestroyRef);

  activeTab = signal<'program' | 'compliance' | 'notifications'>('program');

  notice  = signal('');
  isError = signal(false);
  scanBusy = signal(false);
  currentOrgId = signal<string | null>(null);
  currentUid = signal<string | null>(null);

  program = {
    defaultDueDays: 30,
    autoRemindDays: 7,
    allowSelfEnroll: false,
    requireScore: true,
    passingScore: 80,
    lockSequence: false,
    showCertificates: true,
  };

  compliance = {
    requirePolicyAck: true,
    policyReminderDays: 14,
    autoFlagOverdue: true,
    overdueThresholdDays: 3,
    exportFormat: 'csv' as 'csv' | 'pdf',
    includeScoreInExport: true,
    retentionMonths: 24,
  };

  notifications = {
    sendWelcome: true,
    sendAssignment: true,
    sendReminder: true,
    reminderDays: 7,
    sendOverdue: true,
    sendCompletion: true,
    digestMode: false,
    digestDay: 'monday' as 'monday' | 'wednesday' | 'friday',
  };

  smartReminders: SmartReminderSettings = { ...DEFAULT_SMART_REMINDER_SETTINGS };

  constructor() {
    this.authSvc.profile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(profile => {
        this.currentOrgId.set(profile?.orgId ?? null);
        this.currentUid.set(profile?.uid ?? null);
      });

    this.remindersSvc.settings$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(settings => {
        this.smartReminders = { ...DEFAULT_SMART_REMINDER_SETTINGS, ...settings };
        this.program.defaultDueDays = this.smartReminders.defaultDueDays;
        this.program.autoRemindDays = this.smartReminders.upcomingDueDays;
        this.compliance.overdueThresholdDays = this.smartReminders.overdueEscalationDays;
        this.notifications.sendReminder = this.smartReminders.upcomingDueEnabled;
        this.notifications.reminderDays = this.smartReminders.upcomingDueDays;
        this.notifications.sendOverdue = this.smartReminders.overdueEnabled;
        this.notifications.digestMode = this.smartReminders.digestMode;
      });
  }

  async save() {
    const orgId = this.currentOrgId();
    if (!orgId) {
      this.notice.set('Your account is not linked to an organization.');
      this.isError.set(true);
      return;
    }

    try {
      this.smartReminders = {
        ...this.smartReminders,
        defaultDueDays: Number(this.program.defaultDueDays || 30),
        upcomingDueEnabled: this.notifications.sendReminder,
        upcomingDueDays: Number(this.notifications.reminderDays || this.program.autoRemindDays || 7),
        overdueEnabled: this.notifications.sendOverdue,
        overdueEscalationDays: Number(this.compliance.overdueThresholdDays || 3),
        digestMode: this.notifications.digestMode,
      };
      await this.remindersSvc.saveSettings(orgId, this.smartReminders, this.currentUid());
      this.notice.set('Smart reminder rules saved.');
      this.isError.set(false);
      setTimeout(() => this.notice.set(''), 3500);
    } catch (error: any) {
      this.notice.set(error?.message || 'Unable to save reminder rules.');
      this.isError.set(true);
    }
  }

  async runSmartScanNow() {
    const orgId = this.currentOrgId();
    if (!orgId) {
      this.notice.set('Your account is not linked to an organization.');
      this.isError.set(true);
      return;
    }

    this.scanBusy.set(true);
    try {
      await this.save();
      const result = await this.remindersSvc.runScanNow(orgId);
      this.notice.set(
        `Scan complete: ${result.remindersCreated} reminders created, ${result.skippedExisting} already existed.`
      );
      this.isError.set(false);
    } catch (error: any) {
      this.notice.set(error?.message || 'Unable to run smart reminder scan.');
      this.isError.set(true);
    } finally {
      this.scanBusy.set(false);
    }
  }

  clearNotice() { this.notice.set(''); }
}
