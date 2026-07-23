# @sourceking/tanstack-lingui

TanStack Start + [Lingui](https://lingui.dev) i18n integration. Single factory — SSR middleware, router hydration, client hooks, path utilities. Works in both server and client bundles.

## Install

```bash
bun add @sourceking/tanstack-lingui
```

## Quick start

### 1. Config

```ts
// src/i18n/config.ts
import type { LocaleDefinition } from "@sourceking/tanstack-lingui";

export const locales = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof locales)[number]["code"];
```

### 2. Create instance

```ts
// src/i18n/i18n.ts
import { createLinguiStart } from "@sourceking/tanstack-lingui";
import { locales } from "./config";

export const i18n = createLinguiStart({
  locales,
  defaultLocale: "en",
  cookieName: "locale",
  cookieMaxAge: 31536000,
  ignoredPaths: ["api", "rpc", "webhook"],
  loadMessages: async (locale) => {
    const { messages } = await import(`../locales/${locale}.json?lingui`);
    return messages;
  },
});
```

### 3. Server entry (redirects + cookie sync)

```ts
// src/server.ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { i18n } from "./i18n/i18n";

export default createServerEntry({
  async fetch(request) {
    const { redirect, setCookie } = i18n.i18nServerEntry(request);
    if (redirect) return redirect;

    const response = await handler.fetch(request);

    if (setCookie) {
      response.headers.append(
        "Set-Cookie",
        i18n.createCookieHeader(setCookie.value),
      );
    }

    return response;
  },
});
```

`i18nServerEntry` handles:
- `/en/about` → `/about` (strip default locale)
- `/vi/api/hello` → `/api/hello` (strip locale from ignored paths)
- `Set-Cookie` when URL locale ≠ cookie locale

### 4. Request middleware

```ts
// src/start.ts
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { i18n } from "./i18n/i18n";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, i18n.i18nMiddleware],
}));
```

Middleware extracts locale from URL path or cookie, loads messages, activates i18n, and injects `locale` + `i18n` into request context.

### 5. Router wrapper

```tsx
// src/router.tsx
import { setupI18n } from "@lingui/core";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { i18n } from "./i18n/i18n";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const context = getGlobalStartContext();
  const i18nInstance = context?.i18n ?? setupI18n();

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    context: { i18n: i18nInstance },
  });

  return i18n.routerWithI18n(router, i18nInstance);
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
```

`routerWithI18n` wraps the router with `<I18nProvider>`, handles SSR hydration/dehydration of locale + messages, and supports an optional `WrapProvider` for additional outer wrappers.

### 6. Route files

Use the `{-$locale}` splat:

```
src/routes/{-$locale}/
  index.tsx
  about.tsx
  __root.tsx
```

## Client API

### `useLocale()`

```tsx
import { i18n } from "../i18n/i18n";

export function LangSwitcher() {
  const { currentLocale, switchLocale } = i18n.useLocale();

  return (
    <select
      value={currentLocale}
      onChange={(e) => switchLocale(e.target.value as typeof currentLocale)}
    >
      <option value="en">English</option>
      <option value="vi">Tiếng Việt</option>
    </select>
  );
}
```

`switchLocale` sets a cookie, loads messages, activates the new locale, updates `<html lang>`, and navigates to the locale-prefixed path.

### `LocalizedLink`

```tsx
import { i18n } from "../i18n/i18n";

export function Nav() {
  return (
    <nav>
      <i18n.LocalizedLink to="/">Home</i18n.LocalizedLink>
      <i18n.LocalizedLink to="/about">About</i18n.LocalizedLink>
    </nav>
  );
}
```

Auto-prefixes paths with the current locale. Renders a TanStack `<Link>`.

### `useLocalizedNavigate()`

```tsx
import { i18n } from "../i18n/i18n";

export function About() {
  const navigate = i18n.useLocalizedNavigate();
  return <button onClick={() => navigate("/")}>Go home</button>;
}
```

### Path utilities

```ts
i18n.stripLocalePrefix("/vi/about");  // "/about"
i18n.localizePath("/about");          // "/{-$locale}/about"
```

## API reference

### `createLinguiStart(config): CreateLinguiStartResult<TConfig>`

| Config field | Type | Default | Description |
|---|---|---|---|
| `locales` | `readonly LocaleDefinition[]` | required | Array of `{ code, name, nativeName, regionCode? }` |
| `defaultLocale` | `string` | required | Locale code used when none detected |
| `cookieName` | `string` | `"locale"` | Cookie name for locale persistence |
| `cookieMaxAge` | `number` | `31536000` | Cookie max-age in seconds (1 year) |
| `ignoredPaths` | `string[]` | `[]` | Path prefixes to skip i18n for (e.g. `["api", "rpc"]`) |
| `loadMessages` | `(locale: string) => Promise<Record<string, string>>` | required | Dynamic import of Lingui message catalogs |

### Return value

| Method | Use |
|---|---|
| `config` | The config object passed in |
| `isValidLocale(locale)` | Type guard — checks if string is a valid locale code |
| `shouldIgnorePath(pathname)` | Returns `true` for paths matching `ignoredPaths` |
| `extractLocaleFromPath(pathname)` | Extracts locale code from URL path prefix |
| `parseLocaleCookie(cookieHeader)` | Reads locale from `Cookie` header string |
| `createCookieHeader(value)` | Builds `Set-Cookie` header value |
| `getLocaleFromRequest(request)` | Extracts locale from `Request`, returns `{ locale, headers? }` |
| `i18nServerEntry(request)` | Server entry handler — returns `{ redirect?, setCookie? }` |
| `i18nMiddleware` | TanStack Start request middleware |
| `routerWithI18n(router, i18n, opts?)` | Wraps router with I18nProvider + SSR hydration |
| `stripLocalePrefix(pathname)` | Removes locale prefix from path |
| `localizePath(to)` | Adds `{-$locale}` splat to path |
| `LocalizedLink` | Link component that auto-prefixes locale |
| `useLocale()` | Hook returning `{ currentLocale, switchLocale }` |
| `useLocalizedNavigate()` | Hook returning navigate function that prefixes locale |

## Lingui setup

This package only handles integration with TanStack Start. You still need Lingui's own tooling for message extraction and compilation:

```bash
bun add -D @lingui/cli @lingui/conf
```

```js
// lingui.config.js
export default {
  locales: ["en", "vi"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}",
      include: ["src"],
    },
  ],
  format: "po",
};
```

See [Lingui docs](https://lingui.dev) for extraction, compilation, and message authoring.


## Locale behavior

Priority:

1. URL path prefix: `/vi/about`
2. Cookie: `locale=vi`
3. Default locale: `en`

Default locale has no prefix: `/about`, not `/en/about`.

## API

### `createServerLingui(config)`

Server entrypoint: `@sourceking/tanstack-lingui`.

Returns shared locale utilities plus:

| Member | Use |
| --- | --- |
| `i18nMiddleware` | TanStack Start request middleware. Loads Lingui messages and injects `{ locale, i18n }` context |
| `handleI18nMiddleware(request)` | Server-entry helper for canonical redirects and locale cookie updates |
| `routerWithI18n(router, i18n, opts?)` | Wraps TanStack Router with `I18nProvider` and dehydrate/hydrate support |

### `createClientLingui(config)`

Client entrypoint: `@sourceking/tanstack-lingui/client`.

Returns shared locale utilities plus:

| Member | Use |
| --- | --- |
| `LocalizedLink` | TanStack Router `Link` with `/{-$locale}` prefix |
| `useLocale()` | Returns `{ currentLocale, switchLocale }` |
| `useLocalizedNavigate()` | Returns locale-aware navigate function |

### Shared utilities

Available on both factories:

| Member | Use |
| --- | --- |
| `config` | Original config |
| `isValidLocale(locale)` | Locale type guard |
| `shouldIgnorePath(pathname)` | Checks `ignoredPaths` |
| `extractLocaleFromPath(pathname)` | Reads locale from `/:locale/*` |
| `parseLocaleCookie(cookieHeader)` | Reads valid locale from cookie header |
| `createCookieHeader(value)` | Builds `Set-Cookie` header |
| `getLocaleFromRequest(request)` | Resolves locale and optional `Set-Cookie` header |
| `stripLocalePrefix(pathname)` | Removes locale prefix |
| `localizePath(to)` | Converts `/about` to `/{-$locale}/about` |

## Types

```ts
import type {
	ClientLinguiResult,
	LinguiStartConfig,
	LocaleCode,
	LocaleDefinition,
	LocaleMiddlewareResult,
	LocaleUtilsResult,
	ServerLinguiResult,
} from "@sourceking/tanstack-lingui";
```

`LocaleCode<TConfig>` infers locale union from `config.locales`.
