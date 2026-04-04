import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Accessible aux modérateurs (rank >= 1) et admins. */
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const user   = auth.user();
  if (user && user.rank >= 1) return true;
  return router.createUrlTree(['/login']);
};
