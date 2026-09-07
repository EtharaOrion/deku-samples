import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Attaches the bearer token and clears an expired session. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const withToken = token
    ? req.clone({ setHeaders: { authorization: `Bearer ${token}` } })
    : req;
  return next(withToken).pipe(
    catchError((err) => {
      if (err?.status === 401 && token && !req.url.includes('/auth/login')) {
        // An expired token is cleared and the visitor sent to sign in.
        auth.expire();
        const current = router.url;
        router.navigate(['/login'], { queryParams: { next: current } });
      }
      return throwError(() => err);
    }),
  );
};
