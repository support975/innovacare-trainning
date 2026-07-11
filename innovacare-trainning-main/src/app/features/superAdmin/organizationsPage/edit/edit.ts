import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { entitlementsForPlan } from '../../../../shared/billing/plan-entitlements';

@Component({
  selector: 'app-edit',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './edit.html',
  styleUrl: './edit.css',
})
export class Edit implements OnInit {
  private orgSvc = inject(SuperAdminOrganizationsService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  orgId   = '';
  loading = signal(true);
  busy    = signal(false);
  notice  = signal('');
  isError = signal(false);

  form = {
    name: '',
    type: 'health' as 'health'|'IT'|'school',
    plan: 'free' as 'free'|'pro'|'enterprise',
    learnerLimit: 25 as number | null,
    active: true,
    ownerEmail: '',
    certificationAuthorityEnabled: false,
  };

  planOptions = [
    { value: 'free' as const, label: 'Starter', hint: 'Up to 25 learners' },
    { value: 'pro' as const, label: 'Growth', hint: 'Up to 100 learners' },
    { value: 'enterprise' as const, label: 'Enterprise', hint: 'Custom learner capacity' },
  ];

  ngOnInit() {
    this.orgId = this.route.snapshot.paramMap.get('id') ?? '';
    this.orgSvc.getById(this.orgId).subscribe(org => {
      if (org) {
        this.form = {
          name: org.name,
          type: org.type,
          plan: org.plan,
          learnerLimit: org.learnerLimit ?? entitlementsForPlan(org.plan).learnerLimit,
          active: org.active ?? true,
          ownerEmail: (org as any).ownerEmail ?? '',
          certificationAuthorityEnabled: org.certificationAuthorityEnabled ?? false,
        };
      }
      this.loading.set(false);
    });
  }

  applyPlanDefaults() {
    this.form.learnerLimit = entitlementsForPlan(this.form.plan).learnerLimit;
  }

  async save() {
    if (!this.form.name) { this.notice.set('Name is required.'); this.isError.set(true); return; }
    this.busy.set(true); this.notice.set(''); this.isError.set(false);
    try {
      await this.orgSvc.update(this.orgId, {
        name: this.form.name,
        type: this.form.type,
        plan: this.form.plan,
        learnerLimit: this.form.learnerLimit,
        active: this.form.active,
        certificationAuthorityEnabled: this.form.certificationAuthorityEnabled,
      });
      this.notice.set('Organization updated successfully.');
    } catch (e: any) {
      this.notice.set(e?.message || 'Failed to update.'); this.isError.set(true);
    } finally { this.busy.set(false); }
  }
}
