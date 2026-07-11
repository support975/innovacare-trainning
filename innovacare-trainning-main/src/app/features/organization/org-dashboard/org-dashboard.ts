import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import { OrganizationsService, PublicOrganization } from '../../../shared/services/organizations.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-org-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './org-dashboard.html',
  styleUrl: './org-dashboard.css'
})
export class OrgDashboardComponent {
  private auth = inject(AuthService);
  private orgService = inject(OrganizationsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  orgId = '';
  organization = signal<PublicOrganization | null>(null);
  loading = signal(true);
  currentUser = this.auth.profile$;

  ngOnInit() {
    this.orgId = this.route.snapshot.paramMap.get('orgId') || '';
    if (!this.orgId) {
      this.router.navigate(['/']);
      return;
    }

    this.loadOrganization();
  }

  private loadOrganization() {
    firstValueFrom(this.orgService.getOrganizationById(this.orgId)).then((org) => {
      this.organization.set(org);
      this.loading.set(false);
    }).catch(() => {
      this.loading.set(false);
      this.router.navigate(['/']);
    });
  }

  async logout() {
    try {
      await this.auth.logout();
      await this.router.navigate(['/home']);
    } catch (e: any) {
      console.error('Logout failed:', e);
    }
  }

  navigateToLearner() {
    this.router.navigate(['/learner']);
  }

  navigateToManager() {
    this.router.navigate(['/manager/dashboard']);
  }
}
