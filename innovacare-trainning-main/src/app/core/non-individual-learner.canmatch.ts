import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AppProfile, AuthService } from './auth';

export const nonIndividualLearnerCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),
    take(1),
    map(([_, profile]): boolean | UrlTree => {
      const accountType = (profile as AppProfile | null)?.accountType;
      return accountType === 'individual' ? router.createUrlTree(['/learner']) : true;
    })
  );
};
