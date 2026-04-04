import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Accessible aux admins uniquement (rank >= 2). */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const user   = auth.user();
  if (user && user.rank >= 2) return true;
  if (user && user.rank >= 1) return router.createUrlTree(['/users']);
  return router.createUrlTree(['/login']);
};
