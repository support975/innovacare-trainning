import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaintenanceService } from '../../../core/maintenance.service';

@Component({
  selector: 'app-maintenance-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maintenance-banner.html',
  styleUrl: './maintenance-banner.css',
})
export class MaintenanceBanner {
  private readonly maintenanceSvc = inject(MaintenanceService);

  readonly message = this.maintenanceSvc.bannerMessage;
  dismissed = signal(false);

  dismiss() {
    this.dismissed.set(true);
  }
}
