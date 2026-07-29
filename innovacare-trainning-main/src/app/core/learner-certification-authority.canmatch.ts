import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, combineLatest, filter, map, of, switchMap, take } from 'rxjs';
import { AuthService } from './auth';

type CertificationAuthorityOrg = {
  certificationAuthorityEnabled?: boolean;
  features?: {
    officialCertifications?: boolean;
  };
};

/**
 * Gates learner routes (Official Certifications, Onsite Exams, Verify
 * Membership) behind the org's certificationAuthorityEnabled flag — the
 * same super-admin-controlled toggle certificationAuthorityCanMatch already
 * enforces for the manager shell. Without this, any learner could reach
 * these pages by URL even when their organization never opted into the
 * certification-authority module.
 */
export const learnerCertificationAuthorityCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const firestore = inject(Firestore);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),
    take(1),
    switchMap(([, profile]): Observable<boolean | UrlTree> => {
      if (!profile) return of(router.createUrlTree(['/login']));
      if (profile.role === 'super_admin') return of(true);
      if (!profile.orgId) {
        return of(
          router.createUrlTree(['/learner'], { queryParams: { certificationAuthorityBlocked: 'true' } })
        );
      }

      return docData(doc(firestore, `organizations/${profile.orgId}`)).pipe(
        take(1),
        map((org) => {
          const data = (org || {}) as CertificationAuthorityOrg;
          const enabled =
            data.certificationAuthorityEnabled === true ||
            data.features?.officialCertifications === true;
          return enabled
            ? true
            : router.createUrlTree(['/learner'], {
                queryParams: { certificationAuthorityBlocked: 'true' },
              });
        })
      );
    })
  );
};
