import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { SuperAdminOrganizationsService } from '../services/super-admin-organizations';
import { OrgType } from '../../../data/models';
import { PlanType } from '../models/super-admin.models';

@Component({
  selector: 'app-organizations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './organizations.html',
  styleUrl: './organizations.css'
})
export class Organizations {
  private orgSvc = inject(SuperAdminOrganizationsService);

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

  result = toSignal(
    this.orgSvc.listPage(
      this.search(),
      this.typeFilter(),
      this.planFilter(),
      this.page(),
      this.pageSize
    ),
    { initialValue: { total: 0, items: [] } }
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
      { initialValue: { total: 0, items: [] } }
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
      this.notice.set('Name, owner UID and owner email are required.');
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
          active: true,
          orgId: this.newOrg.orgId || undefined,
        },
        owner: {
          uid: this.newOrg.ownerUid,
          email: this.newOrg.ownerEmail,
          displayName: this.newOrg.ownerDisplayName,
        },
      });

      this.notice.set('Organization created successfully.');
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
      this.notice.set(e?.message || 'Failed to create organization.');
    } finally {
      this.loading.set(false);
    }
  }
}