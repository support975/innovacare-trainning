import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { switchMap, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { AuthService } from '../../../../core/auth';
import { ActingOrgService } from '../../../../core/organization/services/acting-org.service';
import {
  OrganizationCouncilRollupService,
  RegionRollupStats,
} from '../../../../core/organization/services/organization-council-rollup.service';
import { Organization } from '../../../../data/models';
import { LanguageService } from '../../../../shared/services/language';

@Component({
  selector: 'app-facility-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './facility-detail.html',
  styleUrl: './facility-detail.css',
})
export class FacilityDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly afs = inject(Firestore);
  private readonly authSvc = inject(AuthService);
  private readonly orgContext = inject(ActingOrgService);
  private readonly rollupSvc = inject(OrganizationCouncilRollupService);
  private readonly destroyRef = inject(DestroyRef);
  readonly lang = inject(LanguageService);

  readonly facilityId = this.route.snapshot.paramMap.get('facilityId') ?? '';

  loading = signal(true);
  stats = signal<RegionRollupStats | null>(null);
  org = signal<Organization | null>(null);

  constructor() {
    // Intentionally authSvc.profile$ (the corp admin's OWN org), same
    // invariant as council.ts — never the facility being viewed.
    this.authSvc.profile$
      .pipe(
        switchMap((profile) => {
          const councilOrgId = profile?.orgId ?? null;
          if (!councilOrgId) return of(null);
          return this.rollupSvc.rollupFor(councilOrgId);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((rollup) => {
        this.stats.set(rollup?.regions.find((r) => r.orgId === this.facilityId) ?? null);
        this.loading.set(false);
      });

    docData(doc(this.afs, `organizations/${this.facilityId}`))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((org) => this.org.set((org as Organization | undefined) ?? null));
  }

  completionTone(rate: number): 'good' | 'warn' | 'risk' {
    if (rate >= 80) return 'good';
    if (rate >= 50) return 'warn';
    return 'risk';
  }

  manageAsAdmin() {
    const stats = this.stats();
    if (!stats) return;
    this.orgContext.startActing(stats.orgId, stats.orgName);
  }

  backToFacilities() {
    this.router.navigate(['/manager/council']);
  }
}
