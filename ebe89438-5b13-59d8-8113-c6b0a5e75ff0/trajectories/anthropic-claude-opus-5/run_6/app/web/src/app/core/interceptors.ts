import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';

/**
 * An expired or rejected token is cleared and the visitor is sent to
 * /login?next=<current>, rather than being left on a screen that cannot load.
 */
export const expiredTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const api = inject(ApiService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/api/auth/');
      if (err.status === 401 && !isAuthCall && api.token) {
        api.setToken(null);
        const current = router.url || '/';
        router.navigate(['/login'], { queryParams: { next: current } });
      }
      return throwError(() => err);
    }),
  );
};
