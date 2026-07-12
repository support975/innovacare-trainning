import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RewardsAdminService, ManualRewardType } from '../../../../shared/services/rewards-admin.service';
import { UserDirectoryService, LicenseDoc } from '../../../../shared/services/user-directory';
import { BADGE_CATALOG } from '../../../../shared/rewards/reward-catalog';

@Component({
  selector: 'app-grant-reward-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './grant-reward-dialog.html',
  styleUrl: './grant-reward-dialog.css',
})
export class GrantRewardDialog implements OnChanges {
  private rewardsAdmin = inject(RewardsAdminService);
  private userDir = inject(UserDirectoryService);

  @Input() open = false;
  @Input() learnerUid = '';
  @Input() learnerName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() granted = new EventEmitter<void>();

  readonly badgeCatalog = BADGE_CATALOG;

  type = signal<ManualRewardType>('points');
  title = signal('');
  note = signal('');
  points = signal<number | null>(null);
  badgeKey = signal('');
  customBadge = signal(false);
  hours = signal<number | null>(null);
  creditUnit = signal('');
  licenseId = signal('');

  licenses = signal<LicenseDoc[]>([]);
  busy = signal(false);
  error = signal('');

  ngOnChanges(): void {
    if (this.open && this.learnerUid) {
      this.resetForm();
      this.userDir.licensesForUid$(this.learnerUid).subscribe(list => this.licenses.set(list));
    }
  }

  private resetForm() {
    this.type.set('points');
    this.title.set('');
    this.note.set('');
    this.points.set(null);
    this.badgeKey.set('');
    this.customBadge.set(false);
    this.hours.set(null);
    this.creditUnit.set('');
    this.licenseId.set('');
    this.error.set('');
  }

  setType(t: ManualRewardType) {
    this.type.set(t);
    this.error.set('');
  }

  onBadgeSelectChange(value: string) {
    if (value === '__custom__') {
      this.customBadge.set(true);
      this.badgeKey.set('');
    } else {
      this.customBadge.set(false);
      this.badgeKey.set(value);
    }
  }

  close() {
    this.closed.emit();
  }

  async submit() {
    this.error.set('');
    const type = this.type();
    const title = this.title().trim();

    if (!title) {
      this.error.set('Title is required.');
      return;
    }

    const payload: any = { learnerUid: this.learnerUid, type, title };
    if (this.note().trim()) payload.note = this.note().trim();

    if (type === 'points') {
      const pts = Number(this.points());
      if (!(pts > 0)) {
        this.error.set('Enter a positive number of points.');
        return;
      }
      payload.points = pts;
    } else if (type === 'badge') {
      const badge = this.badgeKey().trim();
      if (!badge) {
        this.error.set('Choose or enter a badge.');
        return;
      }
      payload.badge = badge;
      if (this.points() !== null && Number(this.points()) > 0) {
        payload.points = Number(this.points());
      }
    } else {
      const hrs = Number(this.hours());
      if (!(hrs > 0)) {
        this.error.set('Enter a positive number of hours.');
        return;
      }
      payload.hours = hrs;
      if (this.creditUnit().trim()) payload.creditUnit = this.creditUnit().trim();
      if (this.licenseId()) payload.licenseId = this.licenseId();
    }

    this.busy.set(true);
    try {
      await this.rewardsAdmin.grantManualReward(payload);
      this.granted.emit();
      this.close();
    } catch (e: any) {
      this.error.set(e?.message || 'Failed to grant reward.');
    } finally {
      this.busy.set(false);
    }
  }
}
