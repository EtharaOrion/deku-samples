import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const request =
    token && req.url.startsWith('/api')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((e: HttpErrorResponse) => {
      // An expired or rejected token is cleared and the visitor is sent to sign in.
      const isAuthCall = req.url.includes('/api/auth/');
      if (e.status === 401 && token && !isAuthCall) {
        auth.expire();
      }
      return throwError(() => e);
    }),
  );
};
