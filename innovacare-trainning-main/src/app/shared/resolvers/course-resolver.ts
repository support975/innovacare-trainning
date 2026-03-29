import { ResolveFn } from '@angular/router';

export const courseResolver: ResolveFn<boolean> = (route, state) => {
  return true;
};
