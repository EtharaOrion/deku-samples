import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

const TOKEN_KEY = 'cc.token';

/**
 * An expired token is cleared and the visitor is sent to /login?next=<current>.
 * Reads storage directly: injecting AuthService here would create a
 * HttpClient -> interceptor -> AuthService -> HttpClient cycle.
 */
export const authExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    tap({
      error: (e: any) => {
        if (e?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
          localStorage.removeItem(TOKEN_KEY);
          const cur = router.url || '/';
          if (!cur.startsWith('/login')) {
            router.navigate(['/login'], { queryParams: { next: cur } });
          }
        }
      },
    })
  );
};
