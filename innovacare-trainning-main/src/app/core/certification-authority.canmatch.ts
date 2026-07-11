import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, combineLatest, filter, map, of, switchMap, take } from 'rxjs';
import { AuthService, AppProfile } from './auth';

type CertificationAuthorityOrg = {
  certificationAuthorityEnabled?: boolean;
  features?: {
    officialCertifications?: boolean;
  };
};

function hasCertificationPermission(profile: AppProfile | null): boolean {
  const permissions = profile?.permissions || [];
  return permissions.some((permission) => permission.startsWith('certification.'));
}

export const certificationAuthorityCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const firestore = inject(Firestore);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),
    take(1),
    switchMap(([_, profile]): Observable<boolean | UrlTree> => {
      if (!profile) return of(router.createUrlTree(['/login']));
      if (profile.role === 'super_admin') return of(true);
      if (!['admin', 'manager'].includes(profile.role)) {
        return of(router.createUrlTree(['/home']));
      }
      if (hasCertificationPermission(profile)) return of(true);
      if (!profile.orgId) return of(router.createUrlTree(['/manager/dashboard']));

      return docData(doc(firestore, `organizations/${profile.orgId}`)).pipe(
        take(1),
        map((org) => {
          const data = (org || {}) as CertificationAuthorityOrg;
          const enabled =
            data.certificationAuthorityEnabled === true ||
            data.features?.officialCertifications === true;
          return enabled
            ? true
            : router.createUrlTree(['/manager/dashboard'], {
                queryParams: { certificationAuthorityBlocked: 'true' },
              });
        })
      );
    })
  );
};
