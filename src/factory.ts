import type { LinguiStartConfig, LocaleCode } from "./types";

export function createLocaleUtils<TConfig extends LinguiStartConfig>(
	config: TConfig,
) {
	const localeSet = new Set(config.locales.map((l) => l.code));
	const ignoredPathsRegex = config.ignoredPaths
		? new RegExp(`^/(?:${config.ignoredPaths.join("|")})(?:/|$)`)
		: /^(?!)/;

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

	const getLocaleFromRequest = (request: Request) => {
		const url = new URL(request.url);
		const cookieLocale = parseLocaleCookie(request.headers.get("cookie"));

		if (shouldIgnorePath(url.pathname)) {
			return { locale: cookieLocale ?? config.defaultLocale };
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

	return {
		config,
		isValidLocale,
		shouldIgnorePath,
		extractLocaleFromPath,
		parseLocaleCookie,
		createCookieHeader,
		getLocaleFromRequest,
		stripLocalePrefix,
		localizePath,
	};
}
