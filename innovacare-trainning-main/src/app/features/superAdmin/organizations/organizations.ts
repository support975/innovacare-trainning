import { Component, Injector, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import { OrgType } from '../../../data/models';
import { PlanType } from '../models/super-admin.models';
import { entitlementsForPlan } from '../../../shared/billing/plan-entitlements';
import { LanguageService } from '../../../shared/services/language';

@Component({
  selector: 'app-organizations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './organizations.html',
  styleUrl: './organizations.css'
})
export class Organizations {
  private orgSvc = inject(SuperAdminOrganizationsService);
  private injector = inject(Injector);
  readonly lang = inject(LanguageService);

  search = signal('');
  typeFilter = signal<OrgType | 'all'>('all');
  planFilter = signal<PlanType | 'all'>('all');

  page = signal(1);
  pageSize = 10;

  loading = signal(false);
  notice = signal('');

  newOrg = {
    orgId: '',
    name: '',
    type: 'health' as OrgType,
    plan: 'free' as PlanType,
    ownerUid: '',
    ownerEmail: '',
    ownerDisplayName: '',

  };

  planOptions = [
    { value: 'free' as const, label: 'Starter', hint: 'Up to 25 learners' },
    { value: 'pro' as const, label: 'Growth', hint: 'Up to 100 learners' },
    { value: 'enterprise' as const, label: 'Enterprise', hint: 'Custom learner capacity' },
  ];

  planLabel(plan: PlanType | string | undefined): string {
    if (plan === 'free') return this.lang.t('Starter');
    if (plan === 'pro') return this.lang.t('Growth');
    if (plan === 'enterprise') return this.lang.t('Enterprise');
    return plan || '—';
  }

  result = toSignal(
    this.orgSvc.listPage(
      this.search(),
      this.typeFilter(),
      this.planFilter(),
      this.page(),
      this.pageSize
    ),
    { initialValue: { total: 0, items: [] }, injector: this.injector }
  );

  applyFilters() {
    this.page.set(1);
    this.result = toSignal(
      this.orgSvc.listPage(
        this.search(),
        this.typeFilter(),
        this.planFilter(),
        this.page(),
        this.pageSize
      ),
      { initialValue: { total: 0, items: [] }, injector: this.injector }
    );
  }

  nextPage() {
    this.page.set(this.page() + 1);
    this.applyFilters();
  }

  prevPage() {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.applyFilters();
    }
  }

  async createWithOwner() {
    if (!this.newOrg.name || !this.newOrg.ownerUid || !this.newOrg.ownerEmail) {
      this.notice.set(this.lang.t('Name, owner UID and owner email are required.'));
      return;
    }

    this.loading.set(true);
    this.notice.set('');
    try {
      await this.orgSvc.createWithOwner({
        organization: {
          name: this.newOrg.name,
          type: this.newOrg.type,
          plan: this.newOrg.plan,
          learnerLimit: entitlementsForPlan(this.newOrg.plan).learnerLimit,
          active: true,
          orgId: this.newOrg.orgId || undefined,
        },
        owner: {
          uid: this.newOrg.ownerUid,
          email: this.newOrg.ownerEmail,
          displayName: this.newOrg.ownerDisplayName,
        },
      });

      this.notice.set(this.lang.t('Organization created successfully.'));
      this.newOrg = {
        orgId: '',
        name: '',
        type: 'health',
        plan: 'free',
        ownerUid: '',
        ownerEmail: '',
        ownerDisplayName: '',
      };
      this.applyFilters();
    } catch (e: any) {
      this.notice.set(e?.message || this.lang.t('Failed to create organization.'));
    } finally {
      this.loading.set(false);
    }
  }
}
