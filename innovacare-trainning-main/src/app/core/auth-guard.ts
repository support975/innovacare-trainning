import { inject } from '@angular/core';
import {
  CanActivateFn,
  CanMatchFn,
  Router,
  UrlTree,
} from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AuthService } from './auth';

export type AppRole = 'super_admin' | 'manager' | 'admin' | 'learner' | 'guest';

function defaultRouteForRole(role: AppRole): string {
  switch (role) {
    case 'super_admin':
      return '/super-admin/dashboard';
    case 'admin':
    case 'manager':
      return '/manager/dashboard';
    case 'learner':
      return '/learner';
    case 'guest':
      return '/guest';
    default:
      return '/login';
  }
}

function checkRoleAccess(roles: AppRole[]) {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),
    take(1),
    map(([_, profile]): boolean | UrlTree => {
      if (!profile) {
        return router.createUrlTree(['/login']);
      }

      const role = profile.role as AppRole;

      if (roles.includes(role)) {
        return true;
      }

      return router.createUrlTree([defaultRouteForRole(role)]);
    })
  );
}

export function roleGuard(roles: AppRole[]): CanActivateFn {
  return () => checkRoleAccess(roles);
}

export function roleCanMatch(roles: AppRole[]): CanMatchFn {
  return () => checkRoleAccess(roles);
}

export const authCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),
    take(1),
    map(([_, profile]): boolean | UrlTree => {
      if (profile) return true;
      return router.createUrlTree(['/login']);
    })
  );
};