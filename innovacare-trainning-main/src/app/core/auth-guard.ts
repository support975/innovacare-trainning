import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AuthService } from './auth';

export function roleGuard(roles: ('manager'|'admin'|'learner')[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return combineLatest([auth.ready$, auth.profile$]).pipe(
      filter(([ready]) => ready),
      take(1),
      map(([_, p]) => {
        if (p && roles.includes(p.role)) return true;
        router.navigateByUrl('/login');
        return false;
      })
    );
  };
}
