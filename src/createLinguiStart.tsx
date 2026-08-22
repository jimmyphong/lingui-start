import type { I18n } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { I18nProvider, useLingui } from "@lingui/react";
import type { AnyRouter } from "@tanstack/react-router";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { useCallback } from "react";
import type {
	CreateLinguiStartResult,
	LinguiStartConfig,
	LocaleCode,
	LocalizedDestination,
	LocalizedLinkProps,
	LocalizedTo,
} from "./types";

export function createLinguiStart<TConfig extends LinguiStartConfig>(
	config: TConfig,
): CreateLinguiStartResult<TConfig> {
	const localeSet = new Set(config.locales.map((l) => l.code));
	const ignoredPathsRegex = config.ignoredPaths
		? new RegExp(`^/(?:${config.ignoredPaths.join("|")})(?:/|$)`)
		: /^(?!)/; // never match

	// Pure utility functions
	const isValidLocale = (
		locale: string | undefined,
	): locale is LocaleCode<TConfig> => {
		return locale !== undefined && localeSet.has(locale);
	};

	const shouldIgnorePath = (pathname: string): boolean => {
		return ignoredPathsRegex.test(pathname);
	};

	const extractLocaleFromPath = (
		pathname: string,
	): LocaleCode<TConfig> | null => {
		const match = /^\/([a-z]{2})(?:\/|$)/.exec(pathname);
		const locale = match?.[1];
		return locale && isValidLocale(locale)
			? (locale as LocaleCode<TConfig>)
			: null;
	};

	const parseLocaleCookie = (
		cookieHeader: string | null,
	): LocaleCode<TConfig> | null => {
		if (!cookieHeader) return null;
		const cookieName = config.cookieName || "locale";
		const match = cookieHeader.match(
			new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`),
		);
		const rawValue = match?.[1];
		if (!rawValue) return null;
		const val = decodeURIComponent(rawValue);
		return isValidLocale(val) ? (val as LocaleCode<TConfig>) : null;
	};

	const createCookieHeader = (value: LocaleCode<TConfig>): string => {
		const cookieName = config.cookieName || "locale";
		const maxAge = config.cookieMaxAge || 31536000;
		return `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
	};

	// Server: extract locale from request
	const getLocaleFromRequest = (request: Request) => {
		const url = new URL(request.url);
		const cookieLocale = parseLocaleCookie(request.headers.get("cookie"));

		if (shouldIgnorePath(url.pathname)) {
			return {
				locale: cookieLocale ?? config.defaultLocale,
			};
		}

		const locale =
			extractLocaleFromPath(url.pathname) ??
			cookieLocale ??
			config.defaultLocale;
		const shouldSetCookie = cookieLocale !== locale;

		return {
			locale,
			headers: shouldSetCookie
				? [
						{
							key: "Set-Cookie",
							value: createCookieHeader(locale as LocaleCode<TConfig>),
						},
					]
				: undefined,
		};
	};

	// Server: TanStack Start server entry for i18n
	const i18nServerEntry = (request: Request) => {
		const url = new URL(request.url);
		const { pathname } = url;

		if (shouldIgnorePath(pathname)) return {};
		if (
			pathname.startsWith(`/${config.defaultLocale}/`) ||
			pathname === `/${config.defaultLocale}`
		) {
			url.pathname = pathname.replace(`/${config.defaultLocale}`, "") || "/";
			return { redirect: Response.redirect(url.toString(), 301) };
		}

		const urlLocale = extractLocaleFromPath(pathname);

		if (urlLocale) {
			const stripped = pathname.replace(`/${urlLocale}`, "") || "/";
			if (shouldIgnorePath(stripped)) {
				url.pathname = stripped;
				return { redirect: Response.redirect(url.toString(), 301) };
			}

			const cookieLocale = parseLocaleCookie(request.headers.get("cookie"));
			if (urlLocale !== cookieLocale) {
				const cookieName = config.cookieName || "locale";
				return { setCookie: { name: cookieName, value: urlLocale } };
			}
		}

		return {};
	};

	// Server: TanStack Start middleware
	const i18nMiddleware = createMiddleware({ type: "request" }).server(
		async ({ request, next }) => {
			const { locale, headers } = getLocaleFromRequest(request);

			const i18n = setupI18n();
			const messages = await config.loadMessages(locale);
			i18n.loadAndActivate({ locale, messages });

			const result = await next({
				context: {
					locale,
					i18n,
				},
			});

			if (headers) {
				headers.forEach(({ key, value }) => {
					result.response.headers.append(key, value);
				});
			}

			return result;
		},
	);

	// Server: Router wrapper with i18n provider
	const routerWithI18n = <TRouter extends AnyRouter>(
		router: TRouter,
		i18n: I18n,
		additionalOpts?: {
			WrapProvider?: (props: {
				children: React.ReactNode;
			}) => React.JSX.Element;
		},
	) => {
		const options = router.options;

		router.options = {
			...router.options,
			context: {
				...options.context,
				i18n,
			},

			Wrap: ({ children }: { children: React.ReactNode }) => {
				const OuterWrapper = additionalOpts?.WrapProvider;
				const OriginalWrap = options.Wrap;

				const inner = (
					<I18nProvider i18n={i18n}>
						{OriginalWrap ? <OriginalWrap>{children}</OriginalWrap> : children}
					</I18nProvider>
				);

				return OuterWrapper ? <OuterWrapper>{inner}</OuterWrapper> : inner;
			},
		};

		if (router.isServer) {
			router.options.dehydrate = async () => {
				const dehydrated = await options.dehydrate?.();

				return {
					...dehydrated,
					dehydratedI18n: {
						locale: i18n.locale,
						messages: i18n.messages,
					},
				};
			};
		} else {
			router.options.hydrate = async (dehydrated: unknown) => {
				await options.hydrate?.(dehydrated as never);

				const state = dehydrated as {
					dehydratedI18n?: { locale: string; messages: Record<string, string> };
				};
				if (!state.dehydratedI18n) return;

				i18n.loadAndActivate({
					locale: state.dehydratedI18n.locale,
					messages: state.dehydratedI18n.messages,
				});
			};
		}

		return router;
	};

	// Client/Server: path utilities
	const stripLocalePrefix = (pathname: string): string => {
		for (const locale of config.locales) {
			const prefix = `/${locale.code}`;
			if (pathname === prefix) return "/";
			if (pathname.startsWith(`${prefix}/`)) {
				return pathname.slice(prefix.length) || "/";
			}
		}
		return pathname;
	};

	const localizePath = (to: string): string => {
		return to === "/" ? "/{-$locale}" : `/{-$locale}${to}`;
	};

	// Client: LocalizedLink component (compile-time path transform)
	const LocalizedLink = <TTo extends LocalizedTo>(
		props: LocalizedLinkProps<TTo> & {
			ref?: React.Ref<HTMLAnchorElement>;
		},
	) => {
		const { to, ref, ...rest } = props;
		const localizedTo = (
			to === "/" ? "/{-$locale}" : `/{-$locale}${to}`
		) as LocalizedDestination<TTo>;
		return <Link {...rest} ref={ref} to={localizedTo} />;
	};

	// Client: useLocale hook
	const useLocale = () => {
		const router = useRouter();
		const { i18n } = useLingui();
		const currentLocale = (i18n.locale ||
			config.defaultLocale) as LocaleCode<TConfig>;

		const switchLocale = useCallback(
			async (newLocale: LocaleCode<TConfig>, redirectUrl?: string) => {
				if (newLocale === currentLocale || !isValidLocale(newLocale)) return;

				// biome-ignore lint/suspicious/noDocumentCookie: <We are intentionally setting a cookie here to persist the locale change>
				document.cookie = createCookieHeader(newLocale);
				const messages = await config.loadMessages(newLocale);
				i18n.loadAndActivate({ locale: newLocale, messages });
				document.documentElement.lang = newLocale;

				const basePath = stripLocalePrefix(
					redirectUrl || window.location.pathname,
				);
				const newPath =
					newLocale === config.defaultLocale
						? basePath
						: `/${newLocale}${basePath === "/" ? "" : basePath}`;

				await router.navigate({ to: newPath, replace: true });
				await router.invalidate();
			},
			[currentLocale, i18n, router],
		);

		return { currentLocale, switchLocale };
	};

	// Client: useLocalizedNavigate hook
	const useLocalizedNavigate = () => {
		const navigate = useNavigate();
		return useCallback(
			(to: string) => {
				navigate({ to: localizePath(to) });
			},
			[navigate],
		);
	};

	return {
		config,
		isValidLocale,
		shouldIgnorePath,
		extractLocaleFromPath,
		parseLocaleCookie,
		createCookieHeader,
		getLocaleFromRequest,
		i18nServerEntry,
		i18nMiddleware,
		routerWithI18n,
		stripLocalePrefix,
		localizePath,
		LocalizedLink,
		useLocale,
		useLocalizedNavigate,
	};
}
