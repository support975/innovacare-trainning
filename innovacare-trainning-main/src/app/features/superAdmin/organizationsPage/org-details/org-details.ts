import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { SuperAdminUsersService } from '../../services/super-admin-users';
import { SuperAdminOrganization, SuperAdminUser } from '../../models/super-admin.models';
import { entitlementsForPlan } from '../../../../shared/billing/plan-entitlements';

@Component({
  selector: 'app-org-details',
  imports: [CommonModule, RouterLink],
  templateUrl: './org-details.html',
  styleUrl: './org-details.css',
})
export class OrgDetails implements OnInit {
  private orgSvc   = inject(SuperAdminOrganizationsService);
  private usersSvc = inject(SuperAdminUsersService);
  private route    = inject(ActivatedRoute);

  orgId   = '';
  org     = signal<SuperAdminOrganization | null>(null);
  members = signal<SuperAdminUser[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.orgId = this.route.snapshot.paramMap.get('id') ?? '';
    combineLatest([
      this.orgSvc.getById(this.orgId),
      this.usersSvc.list(),
    ]).pipe(
      map(([org, users]) => ({ org, members: users.filter(u => u.orgId === this.orgId) }))
    ).subscribe(({ org, members }) => {
      this.org.set(org);
      this.members.set(members);
      this.loading.set(false);
    });
  }

  initials(name: string): string {
    const p = (name || '').trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (name || '?').slice(0, 2).toUpperCase();
  }

  formatDate(value: any): string {
    if (!value) return '-';
    const raw = typeof value?.toDate === 'function'
      ? value.toDate()
      : typeof value?.seconds === 'number'
        ? new Date(value.seconds * 1000)
        : new Date(value);

    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return '-';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(raw);
  }

  planLabel(plan: string | undefined): string {
    if (plan === 'free') return 'Starter';
    if (plan === 'pro') return 'Growth';
    if (plan === 'enterprise') return 'Enterprise';
    return plan || '-';
  }

  learnerLimit(org: SuperAdminOrganization): string {
    const limit = org.learnerLimit ?? entitlementsForPlan(org.plan).learnerLimit;
    return limit ? String(limit) : 'Custom';
  }

  learnerCount(): number {
    return this.members().filter(member => member.role === 'learner').length;
  }
}
