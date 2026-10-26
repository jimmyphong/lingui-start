# @jimmyphong/lingui-start

[TanStack Start](https://tanstack.com/start) + [Lingui](https://lingui.dev) i18n integration. One factory, `createLinguiStart`, gives you the server entry handler, request middleware, router SSR hydration, locale-aware links and hooks, and path utilities. The same instance works in both the server and client bundles.

## Install

```bash
npm install @jimmyphong/lingui-start
# or
bun add @jimmyphong/lingui-start
```

Peer dependencies (install them in your app if they aren't there yet):

```bash
npm install react react-dom @lingui/core @lingui/react @tanstack/react-router @tanstack/react-start
```

## Quick start

### 1. Locales

```ts
// src/i18n/config.ts
import type { LocaleDefinition } from "@jimmyphong/lingui-start";

export const locales = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof locales)[number]["code"];
```

Use `as const` so `LocaleCode` gives you a union like `"en" | "es" | "fr" | "de"` and not just `string`.

> Locale codes in URLs are matched as **two lowercase letters** (`/fr/...`). Codes like `pt-BR` won't be picked up from the path.

### 2. Create the instance

```ts
// src/i18n/i18n.ts
import { createLinguiStart } from "@jimmyphong/lingui-start";
import { locales } from "./config";

export const i18n = createLinguiStart({
  locales,
  defaultLocale: "en",
  cookieName: "locale",
  cookieMaxAge: 31536000,
  ignoredPaths: ["api", "rpc", "webhook"],
  loadMessages: async (locale) => {
    const { messages } = await import(`../locales/${locale}.po`);
    return messages;
  },
});
```

The `.po` import needs [`@lingui/vite-plugin`](https://lingui.dev/ref/vite-plugin) (see [Lingui setup](#lingui-setup)). You can also import compiled catalogs instead.

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

`i18nServerEntry(request)` returns `{ redirect?, setCookie? }`:

- `/en/about` → 301 to `/about` (the default locale is never prefixed)
- `/fr/api/hello` → 301 to `/api/hello` (ignored paths never carry a locale)
- `/fr/about` with a missing or different locale cookie → `setCookie: { name, value: "fr" }`
- Paths matching `ignoredPaths` → `{}` (nothing to do)

### 4. Request middleware

```ts
// src/start.ts
import { createStart } from "@tanstack/react-start";
import { i18n } from "./i18n/i18n";

export const startInstance = createStart(() => ({
  requestMiddleware: [i18n.i18nMiddleware],
}));
```

On every request the middleware works out the locale (see [Locale resolution](#locale-resolution)), creates a Lingui `I18n` instance, loads that locale's messages with `loadMessages`, activates it, and passes `{ locale, i18n }` into the request context. If the locale cookie doesn't match, it also adds a `Set-Cookie` header to the response.

### 5. Router

```tsx
// src/router.tsx
import { createRouter } from "@tanstack/react-router";
import { i18n } from "./i18n/i18n";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // Server: the instance the middleware put in the request context.
  // Client: a fresh instance, filled during hydration.
  const i18nInstance = i18n.setupI18n();

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
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

`routerWithI18n(router, i18n, opts?)`:

- adds `i18n` to the router context
- wraps the app in Lingui's `<I18nProvider>` and keeps any `Wrap` you already set
- on the server, dehydrates the current locale and messages into the SSR payload
- on the client, hydrates them, activates the locale, and caches the messages so switching back costs nothing
- `opts.WrapProvider`, if given, is rendered **outside** `<I18nProvider>`

### 6. Routes

Put localized routes under the optional path param `{-$locale}`:

```
src/routes/
  __root.tsx
  {-$locale}/
    index.tsx       → /, /fr
    about.tsx       → /about, /fr/about
  api/              → not localized (listed in ignoredPaths)
```

## Client API

### `useLocale()`

```tsx
import { i18n } from "../i18n/i18n";
import { locales, type Locale } from "../i18n/config";

export function LangSwitcher() {
  const { currentLocale, switchLocale, preloadLocale } = i18n.useLocale();

  return (
    <select
      value={currentLocale}
      onFocus={() => locales.forEach((l) => preloadLocale(l.code))}
      onChange={(e) => switchLocale(e.target.value as Locale)}
    >
      {locales.map((l) => (
        <option key={l.code} value={l.code}>
          {l.nativeName}
        </option>
      ))}
    </select>
  );
}
```

Returns `{ currentLocale, switchLocale, preloadLocale }`.

`switchLocale(locale, redirect?)`:

1. does nothing if `locale` is already active or isn't valid
2. writes the locale cookie
3. loads the messages (once per locale; a pending preload is reused) and activates them
4. sets `<html lang>`
5. navigates (with `replace`) to the same path under the new locale prefix, with no prefix for the default locale
6. calls `router.invalidate()` to re-run loaders, unless that's turned off

`redirect` can be a path string, or an options object:

```ts
switchLocale("fr", "/about");                              // land on /fr/about
switchLocale("fr", { redirectUrl: "/about" });             // same
switchLocale("fr", { invalidate: false });                 // skip router.invalidate() this time
```

### `preloadLocale(locale)`

Starts loading a locale's messages ahead of time, e.g. on hover, on focus or when a menu opens, so the switch that follows doesn't have to wait. It never rejects. If a load fails, the next call tries again. It's available on the instance (`i18n.preloadLocale`) and from `useLocale()`.

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

A TanStack `<Link>` whose `to` is written **without** the locale segment. `"/about"` becomes `"/{-$locale}/about"`, so the current locale is kept. `to` is type-checked against the routes under `{-$locale}` in your route tree. All other `Link` props, including `ref`, are passed through.

### `useLocalizedNavigate()`

```tsx
import { i18n } from "../i18n/i18n";

export function About() {
  const navigate = i18n.useLocalizedNavigate();
  return <button onClick={() => navigate("/")}>Go home</button>;
}
```

Returns `(to: string) => void`, which navigates to `localizePath(to)`.

### Path utilities

```ts
i18n.stripLocalePrefix("/fr/about"); // "/about"
i18n.stripLocalePrefix("/fr");       // "/"
i18n.localizePath("/about");         // "/{-$locale}/about"
i18n.localizePath("/");              // "/{-$locale}"
```

## Locale resolution

**Localized routes** (anything not in `ignoredPaths`):

1. Locale prefix in the URL: `/fr/about` → `fr`
2. No prefix → `defaultLocale`

The URL decides. The cookie just follows it: when the cookie doesn't match the URL locale, the server sends a new one. The default locale is never prefixed, so `/en/about` redirects to `/about`.

**Ignored paths** (`ignoredPaths`, e.g. `/api/*`):

1. Locale cookie
2. `defaultLocale`

## API reference

### `createLinguiStart(config)`

| Config field | Type | Default | Description |
|---|---|---|---|
| `locales` | `readonly LocaleDefinition[]` | required | `{ code, name, nativeName, regionCode? }[]` |
| `defaultLocale` | locale code | required | Used when the URL has no locale prefix. Never prefixed. |
| `loadMessages` | `(locale: string) => Promise<Record<string, string>>` | required | Loads a locale's Lingui catalog |
| `cookieName` | `string` | `"locale"` | Cookie that stores the locale |
| `cookieMaxAge` | `number` | `31536000` | Cookie max-age in seconds (1 year) |
| `ignoredPaths` | `string[]` | none | First path segments that are never localized, e.g. `["api", "rpc"]`. They are joined into a regex, so escape special characters. |
| `invalidateOnSwitch` | `boolean` | `true` | Run `router.invalidate()` after `switchLocale`. Set it to `false` when no loader returns locale-dependent data. |

### Returned instance

| Member | Where | Description |
|---|---|---|
| `config` | both | The config you passed in |
| `isValidLocale(locale)` | both | Type guard for configured locale codes |
| `shouldIgnorePath(pathname)` | both | `true` if the path matches `ignoredPaths` |
| `extractLocaleFromPath(pathname)` | both | Locale from the `/xx/...` prefix, or `null` |
| `parseLocaleCookie(cookieHeader)` | both | Valid locale from a `Cookie` header, or `null` |
| `createCookieHeader(locale)` | both | `"<name>=<locale>; Path=/; Max-Age=<n>; SameSite=Lax"` |
| `stripLocalePrefix(pathname)` | both | Removes the locale prefix |
| `localizePath(to)` | both | `/about` → `/{-$locale}/about` |
| `getLocaleFromRequest(request)` | server | `{ locale, headers? }`; `headers` holds a `Set-Cookie` entry when the cookie needs updating |
| `i18nServerEntry(request)` | server | `{ redirect?, setCookie? }` for `createServerEntry` |
| `i18nMiddleware` | server | TanStack Start request middleware. Adds `{ locale, i18n }` to the context. |
| `setupI18n()` | both | The `I18n` from the global Start context if there is one, otherwise a new instance |
| `routerWithI18n(router, i18n, opts?)` | both | Adds `I18nProvider` and SSR dehydrate/hydrate to the router |
| `preloadLocale(locale)` | client | Loads a locale's messages ahead of time |
| `LocalizedLink` | client | Locale-aware TanStack `Link` |
| `useLocale()` | client | `{ currentLocale, switchLocale, preloadLocale }` |
| `useLocalizedNavigate()` | client | Locale-aware `(to: string) => void` |

### `createMessageCache(loadMessages)`

The per-locale message cache that `switchLocale` and `preloadLocale` use internally. It's exported in case you want the same behaviour somewhere else:

```ts
import { createMessageCache } from "@jimmyphong/lingui-start";

const cache = createMessageCache((locale) => import(`./locales/${locale}.po`).then((m) => m.messages));

cache.preload("fr");           // start loading, never rejects
await cache.load("fr");        // shares the same request
cache.seed("en", messages);    // record messages you already have
cache.has("fr");               // true while loaded or loading
```

A load that fails is dropped from the cache, so the next `load` tries again.

## Types

```ts
import type {
  CreateLinguiStartResult,
  DehydratedI18n,
  LinguiStartConfig,
  LocaleCode,
  LocaleDefinition,
  LocaleFromRequestResult,
  LocaleMiddlewareResult,
  LocalizedDestination,
  LocalizedFullPaths,
  LocalizedLinkProps,
  LocalizedTo,
  MessageCache,
  SetCookieResult,
  StripLocalePrefix,
  SwitchLocaleOptions,
} from "@jimmyphong/lingui-start";
```

- `LocaleCode<TConfig>`: union of the locale codes in `config.locales`
- `LocalizedTo`: every route path under `/{-$locale}`, without the prefix (what `LocalizedLink` accepts)

## Lingui setup

This package only connects Lingui to TanStack Start. Extracting, compiling and writing messages is still done with Lingui's own tools:

```bash
npm install -D @lingui/cli @lingui/conf @lingui/vite-plugin
```

```ts
// lingui.config.ts
import { defineConfig } from "@lingui/conf";

export default defineConfig({
  locales: ["en", "es", "fr", "de"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}",
      include: ["src"],
    },
  ],
});
```

Add `lingui()` from `@lingui/vite-plugin` to your Vite config, together with the Lingui macro plugin for Babel or SWC. The [Lingui docs](https://lingui.dev) cover extraction, compilation and macros.

## License

MIT
