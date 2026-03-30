import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AuthService } from './auth';
import { AppRole, defaultRouteForRole } from './role-redirect';

export function roleCanMatch(
  roles: AppRole[]
): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return combineLatest([auth.ready$, auth.profile$]).pipe(
      filter(([ready]) => ready),
      take(1),
      map(([_, p]): boolean | UrlTree => {
        if (!p) {
          return router.createUrlTree(['/login']);
        }

        if (roles.includes(p.role as AppRole)) {
          return true;
        }

        return router.createUrlTree([defaultRouteForRole(p.role as AppRole)]);
      })
    );
  };
}