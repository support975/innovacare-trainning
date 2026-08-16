import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, of, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { SuperAdminOrganizationsService } from '../../services/super-admin-organizations';
import { SuperAdminUsersService } from '../../services/super-admin-users';
import { SuperAdminOrganization, SuperAdminUser } from '../../models/super-admin.models';
import { entitlementsForPlan } from '../../../../shared/billing/plan-entitlements';
import {
  CouncilRollup,
  OrganizationCouncilRollupService,
} from '../../../../core/organization/services/organization-council-rollup.service';
import { LanguageService } from '../../../../shared/services/language';

const EMPTY_ROLLUP: CouncilRollup = {
  regions: [],
  totalLearners: 0,
  totalCompleted: 0,
  totalInProgress: 0,
  totalOverdue: 0,
  averageCompletionRate: 0,
};

@Component({
  selector: 'app-org-details',
  imports: [CommonModule, RouterLink],
  templateUrl: './org-details.html',
  styleUrl: './org-details.css',
})
export class OrgDetails implements OnInit {
  private orgSvc   = inject(SuperAdminOrganizationsService);
  private usersSvc = inject(SuperAdminUsersService);
  private rollupSvc = inject(OrganizationCouncilRollupService);
  private route    = inject(ActivatedRoute);
  readonly lang    = inject(LanguageService);

  orgId   = '';
  org     = signal<SuperAdminOrganization | null>(null);
  members = signal<SuperAdminUser[]>([]);
  loading = signal(true);

  rollup = signal<CouncilRollup>(EMPTY_ROLLUP);
  loadingRollup = signal(true);

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

    this.orgSvc.getById(this.orgId).pipe(
      switchMap((org) => org?.canCreateSubOrgs ? this.rollupSvc.rollupFor(this.orgId) : of(EMPTY_ROLLUP))
    ).subscribe((rollup) => {
      this.rollup.set(rollup);
      this.loadingRollup.set(false);
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
    if (plan === 'free') return this.lang.t('Starter');
    if (plan === 'pro') return this.lang.t('Growth');
    if (plan === 'enterprise') return this.lang.t('Enterprise');
    return plan || '-';
  }

  learnerLimit(org: SuperAdminOrganization): string {
    const limit = org.learnerLimit ?? entitlementsForPlan(org.plan).learnerLimit;
    return limit ? String(limit) : this.lang.t('Custom');
  }

  learnerCount(): number {
    return this.members().filter(member => member.role === 'learner').length;
  }

  completionTone(rate: number): 'good' | 'warn' | 'risk' {
    if (rate >= 80) return 'good';
    if (rate >= 50) return 'warn';
    return 'risk';
  }
}
