# @tanstack-start/linguijs

TanStack Start + LinguiJS i18n helpers. SSR + CSR. Server/client bundles split.

## Install

```bash
bun add @tanstack-start/linguijs
```

## Entrypoints

| Import | Use |
| --- | --- |
| `@tanstack-start/linguijs` | Server-only factory + shared types |
| `@tanstack-start/linguijs/client` | Client-only factory + shared types |

Client entrypoint does not import `@tanstack/react-start` or server middleware code.

## Config

```ts
// src/i18n/config.ts
import type { LocaleDefinition } from "@tanstack-start/linguijs";

export const locales = [
	{ code: "en", name: "English", nativeName: "English" },
	{ code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof locales)[number]["code"];
```

## Server setup

```ts
// src/i18n/server.ts
import { createServerLingui } from "@tanstack-start/linguijs";
import { locales } from "./config";

export const i18n = createServerLingui({
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

### Start request middleware

```ts
// src/start.ts
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { i18n } from "./i18n/server";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware, i18n.i18nMiddleware],
}));
```

### Server entry redirect/cookie middleware

Use `handleI18nMiddleware()` in server entry when canonical URLs matter.

It handles:

- `/en/about` → `/about` for default locale
- `/vi/api/hello` → `/api/hello` when `api` is ignored
- `Set-Cookie` when URL locale differs from cookie

```ts
// src/server.ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { i18n } from "./i18n/server";

export default createServerEntry({
	async fetch(request) {
		const { redirect, setCookie } = i18n.handleI18nMiddleware(request);
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

### Router wrapper

```tsx
// src/router.tsx
import { setupI18n } from "@lingui/core";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import { i18n } from "./i18n/server";
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

## Client setup

```ts
// src/i18n/client.ts
import { createClientLingui } from "@tanstack-start/linguijs/client";
import { locales } from "./config";

export const i18nClient = createClientLingui({
	locales,
	defaultLocale: "en",
	cookieName: "locale",
	loadMessages: async (locale) => {
		const { messages } = await import(`../locales/${locale}.json?lingui`);
		return messages;
	},
});
```

## Components

```tsx
// src/components/LangSwitcher.tsx
import { i18nClient } from "../i18n/client";

export function LangSwitcher() {
	const { currentLocale, switchLocale } = i18nClient.useLocale();

	return (
		<select
			value={currentLocale}
			onChange={(event) => switchLocale(event.target.value as typeof currentLocale)}
		>
			<option value="en">English</option>
			<option value="vi">Tiếng Việt</option>
		</select>
	);
}
```

```tsx
// src/components/Navigation.tsx
import { i18nClient } from "../i18n/client";

export function Navigation() {
	return (
		<nav>
			<i18nClient.LocalizedLink to="/">Home</i18nClient.LocalizedLink>
			<i18nClient.LocalizedLink to="/about">About</i18nClient.LocalizedLink>
			<i18nClient.LocalizedLink to="/news">News</i18nClient.LocalizedLink>
		</nav>
	);
}
```

```tsx
// src/routes/{-$locale}/about.tsx
import { i18nClient } from "../../i18n/client";

export function About() {
	const navigate = i18nClient.useLocalizedNavigate();

	return <button onClick={() => navigate("/")}>Go home</button>;
}
```

## Locale behavior

Priority:

1. URL path prefix: `/vi/about`
2. Cookie: `locale=vi`
3. Default locale: `en`

Default locale has no prefix: `/about`, not `/en/about`.

## API

### `createServerLingui(config)`

Server entrypoint: `@tanstack-start/linguijs`.

Returns shared locale utilities plus:

| Member | Use |
| --- | --- |
| `i18nMiddleware` | TanStack Start request middleware. Loads Lingui messages and injects `{ locale, i18n }` context |
| `handleI18nMiddleware(request)` | Server-entry helper for canonical redirects and locale cookie updates |
| `routerWithI18n(router, i18n, opts?)` | Wraps TanStack Router with `I18nProvider` and dehydrate/hydrate support |

### `createClientLingui(config)`

Client entrypoint: `@tanstack-start/linguijs/client`.

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
} from "@tanstack-start/linguijs";
```

`LocaleCode<TConfig>` infers locale union from `config.locales`.
