import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuperAdminDashboardStats } from '../models/super-admin.models';
import { SuperAdminDashboardService } from '../services/super-admin-facade';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
})
export class Dashboard {

  cards = [
    { label: 'Organizations', value: 0 },
    { label: 'Users', value: 0 },
    { label: 'Courses', value: 0 },
    { label: 'Active Plans', value: 0 },
  ];

   private dashboardSvc = inject(SuperAdminDashboardService);

  loading = signal(true);
  stats = signal<SuperAdminDashboardStats>({
    organizations: 0,
    users: 0,
    activeOrganizations: 0,
    activeUsers: 0,
    billingActive: 0,
    criticalLogs: 0,
  });

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.dashboardSvc.getStats();
      this.stats.set(data);
    } finally {
      this.loading.set(false);
    }
  }

}