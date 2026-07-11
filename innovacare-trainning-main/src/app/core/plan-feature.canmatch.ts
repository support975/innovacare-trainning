import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, combineLatest, filter, map, of, switchMap, take } from 'rxjs';
import { AuthService } from './auth';
import { PlanFeature, planHasFeature } from '../shared/billing/plan-entitlements';

type OrganizationPlanDoc = {
  plan?: string;
};

export function planFeatureCanMatch(feature: PlanFeature): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const firestore = inject(Firestore);

    return combineLatest([auth.ready$, auth.profile$]).pipe(
      filter(([ready]) => ready),
      take(1),
      switchMap(([_, profile]): Observable<boolean | UrlTree> => {
        if (!profile) return of(router.createUrlTree(['/login']));
        if (profile.role === 'super_admin') return of(true);
        if (!profile.orgId) return of(router.createUrlTree(['/manager/dashboard']));

        return docData(doc(firestore, `organizations/${profile.orgId}`)).pipe(
          take(1),
          map((org) => {
            const allowed = planHasFeature((org as OrganizationPlanDoc | undefined)?.plan, feature);
            return allowed ? true : router.createUrlTree(['/manager/dashboard'], {
              queryParams: { planBlocked: feature },
            });
          })
        );
      })
    );
  };
}
