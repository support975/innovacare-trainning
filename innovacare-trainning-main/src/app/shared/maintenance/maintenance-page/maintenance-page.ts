import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MaintenanceService } from '../../../core/maintenance.service';

@Component({
  selector: 'app-maintenance-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './maintenance-page.html',
  styleUrl: './maintenance-page.css',
})
export class MaintenancePage {
  private readonly maintenanceSvc = inject(MaintenanceService);

  readonly message = this.maintenanceSvc.blockMessage;
  readonly estimatedReturnAt = this.maintenanceSvc.estimatedReturnAt;

  formatReturn(value: any): string {
    if (!value) return '';
    const raw = typeof value?.toDate === 'function'
      ? value.toDate()
      : typeof value?.seconds === 'number'
        ? new Date(value.seconds * 1000)
        : new Date(value);
    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(raw);
  }
}
