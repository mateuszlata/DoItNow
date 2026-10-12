import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { authHref, safeNext } from "@/lib/next-path";

const PROTECTED_ROUTES = ["/events/new", "/my", "/venues", "/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      // Po zalogowaniu wracamy na stronę, na którą ktoś próbował wejść.
      return context.redirect(authHref("signin", safeNext(context.url.pathname + context.url.search)));
    }
  }

  return next();
});
