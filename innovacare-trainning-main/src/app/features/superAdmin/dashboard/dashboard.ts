import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SuperAdminDashboardStats } from '../models/super-admin.models';
import { SuperAdminDashboardService } from '../services/super-admin-facade';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
})
export class Dashboard implements OnInit {
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
