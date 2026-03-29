import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
import { AuthService } from './auth';

export const authCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.ready$, auth.profile$]).pipe(
    filter(([ready]) => ready),     // attendre la fin de onAuthStateChanged
    take(1),                        // une seule décision
    map(([_, profile]) => {
      if (profile) return true;
      router.navigateByUrl('/login');  // IMPORTANT: ton login est /login
      return false;
    })
  );
};
