import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { entitlementsForPlan } from '../../../../shared/billing/plan-entitlements';

@Component({
  selector: 'app-create',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './create.html',
  styleUrl: './create.css',
})
export class Create {
  private orgSvc  = inject(SuperAdminOrganizationsService);
  private router  = inject(Router);

  busy    = signal(false);
  notice  = signal('');
  isError = signal(false);
  created = signal<{ orgId: string; ownerUid: string; ownerEmail: string; temporaryPassword: string } | null>(null);

  form = {
    name: '', orgId: '',
    type: 'health' as 'health' | 'IT' | 'school',
    plan: 'free' as 'free' | 'pro' | 'enterprise',
    ownerEmail: '', ownerDisplayName: '',
  };

  planOptions = [
    { value: 'free' as const, label: 'Starter', hint: 'Up to 25 learners' },
    { value: 'pro' as const, label: 'Growth', hint: 'Up to 100 learners' },
    { value: 'enterprise' as const, label: 'Enterprise', hint: 'Custom learner capacity' },
  ];

  async create() {
    if (!this.form.name || !this.form.ownerEmail) {
      this.notice.set('Name and owner email are required.');
      this.isError.set(true);
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    this.isError.set(false);
    this.created.set(null);
    try {
      const created = await this.orgSvc.createWithGeneratedOwner({
        organization: {
          name: this.form.name,
          type: this.form.type,
          plan: this.form.plan,
          learnerLimit: entitlementsForPlan(this.form.plan).learnerLimit,
          active: true,
          orgId: this.form.orgId || undefined,
        },
        owner: { email: this.form.ownerEmail, displayName: this.form.ownerDisplayName },
      });
      this.created.set(created);
      this.notice.set('Organization and admin account created successfully. Save the temporary password now.');
      this.form = {
        name: '', orgId: '',
        type: 'health',
        plan: 'free',
        ownerEmail: '', ownerDisplayName: '',
      };
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to create organization.');
      this.isError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  goToOrganizations() {
    this.router.navigate(['/super-admin/organizations']);
  }
}
