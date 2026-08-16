import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { AuthService } from '../../../core/auth';
import { Organization, OrgType } from '../../../data/models';
import { OrganizationHierarchyService } from '../../../core/organization/services/organization-hierarchy.service';
import {
  CouncilRollup,
  OrganizationCouncilRollupService,
} from '../../../core/organization/services/organization-council-rollup.service';
import { ManagedUsersService } from '../../../shared/services/managed-users';
import { LanguageService } from '../../../shared/services/language';

const EMPTY_ROLLUP: CouncilRollup = {
  regions: [],
  totalLearners: 0,
  totalCompleted: 0,
  totalInProgress: 0,
  totalOverdue: 0,
  averageCompletionRate: 0,
};

@Component({
  selector: 'app-council',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './council.html',
  styleUrl: './council.css',
})
export class Council {
  private readonly authSvc = inject(AuthService);
  private readonly hierarchy = inject(OrganizationHierarchyService);
  private readonly rollupSvc = inject(OrganizationCouncilRollupService);
  private readonly managedUsers = inject(ManagedUsersService);
  private readonly destroyRef = inject(DestroyRef);
  readonly lang = inject(LanguageService);

  councilOrgId = signal<string | null>(null);
  rollup = signal<CouncilRollup>(EMPTY_ROLLUP);
  loadingRollup = signal(true);

  regionForm = { name: '', type: 'health' as OrgType, plan: 'free' as Organization['plan'] };
  creatingRegion = signal(false);
  regionNotice = signal('');
  regionError = signal(false);

  inviteForm = { orgId: '', email: '', displayName: '' };
  invitingAdmin = signal(false);
  inviteNotice = signal('');
  inviteError = signal(false);

  constructor() {
    // Intentionally authSvc.profile$, NOT ActingOrgService.effectiveProfile$ —
    // this page must always show the corp admin's OWN facility list, even
    // while "acting as" one of those facilities. Do not retrofit this file.
    this.authSvc.profile$
      .pipe(
        switchMap((profile) => {
          const orgId = profile?.orgId ?? null;
          this.councilOrgId.set(orgId);
          if (!orgId) {
            this.loadingRollup.set(false);
            return of(EMPTY_ROLLUP);
          }
          return this.rollupSvc.rollupFor(orgId);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((rollup) => {
        this.rollup.set(rollup);
        this.loadingRollup.set(false);
      });
  }

  async createRegion() {
    this.regionNotice.set('');
    this.regionError.set(false);

    const parentOrgId = this.councilOrgId();
    const name = this.regionForm.name.trim();
    if (!parentOrgId) {
      this.regionNotice.set(this.lang.t('Your admin account is not linked to an organization.'));
      this.regionError.set(true);
      return;
    }
    if (!name) {
      this.regionNotice.set(this.lang.t('Facility name is required.'));
      this.regionError.set(true);
      return;
    }

    this.creatingRegion.set(true);
    try {
      await this.hierarchy.createRegion({
        parentOrgId,
        name,
        type: this.regionForm.type,
        plan: this.regionForm.plan,
      });
      this.regionNotice.set(this.lang.t('Facility "{name}" created.', { name }));
      this.regionForm.name = '';
    } catch (e: any) {
      this.regionNotice.set(e?.message || this.lang.t('Failed to create facility.'));
      this.regionError.set(true);
    } finally {
      this.creatingRegion.set(false);
    }
  }

  async inviteRegionalAdmin() {
    this.inviteNotice.set('');
    this.inviteError.set(false);

    const orgId = this.inviteForm.orgId;
    const email = this.inviteForm.email.trim();
    if (!orgId) {
      this.inviteNotice.set(this.lang.t('Choose a facility first.'));
      this.inviteError.set(true);
      return;
    }
    if (!email) {
      this.inviteNotice.set(this.lang.t('Email is required.'));
      this.inviteError.set(true);
      return;
    }

    this.invitingAdmin.set(true);
    try {
      const result = await this.managedUsers.create({
        displayName: this.inviteForm.displayName.trim(),
        email,
        role: 'admin',
        orgId,
      });
      this.inviteNotice.set(
        this.lang.t('Admin {email} created — temporary password: {password}', {
          email: result.email,
          password: result.temporaryPassword,
        })
      );
      this.inviteForm.email = '';
      this.inviteForm.displayName = '';
    } catch (e: any) {
      this.inviteNotice.set(e?.message || this.lang.t('Failed to create facility admin.'));
      this.inviteError.set(true);
    } finally {
      this.invitingAdmin.set(false);
    }
  }
}
