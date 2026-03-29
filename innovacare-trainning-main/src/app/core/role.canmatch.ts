// src/app/core/role.canmatch.ts
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AuthService } from './auth';

export function roleCanMatch(roles: Array<'manager' | 'admin' | 'learner'>): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    return combineLatest([auth.ready$, auth.profile$]).pipe(
      filter(([ready]) => ready), // attendre onAuthStateChanged
      take(1),
      map(([_, p]) => {
        if (p && roles.includes(p.role)) return true;

        // si pas autorisé, rediriger
        router.navigateByUrl('/login');
        return false;
      })
    );
  };
}
