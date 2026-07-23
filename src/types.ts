import type { I18n } from "@lingui/core";
import type { AnyRouter, Link } from "@tanstack/react-router";
import type { RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { JSX } from "react/jsx-runtime";

export interface LocaleDefinition {
	code: string;
	name: string;
	nativeName: string;
	regionCode?: string;
}

export interface LinguiStartConfig<
	TLocales extends readonly LocaleDefinition[] = readonly LocaleDefinition[],
> {
	locales: TLocales;
	defaultLocale: TLocales[number]["code"];
	cookieName?: string;
	cookieMaxAge?: number;
	ignoredPaths?: string[];
	loadMessages: (locale: string) => Promise<Record<string, string>>;
}

export type LocaleCode<TConfig extends LinguiStartConfig> =
	TConfig["locales"][number]["code"];

export type LocalizedLinkProps = Omit<ComponentProps<typeof Link>, "to"> & {
	to: string;
};

export interface DehydratedI18n {
	locale: string;
	messages: Record<string, string>;
}

export interface SetCookieResult {
	key: string;
	value: string;
}

export interface LocaleFromRequestResult {
	locale: string;
	headers?: SetCookieResult[];
}

export interface LocaleMiddlewareResult {
	redirect?: Response;
	setCookie?: { name: string; value: string };
}

export interface CreateLinguiStartResult<TConfig extends LinguiStartConfig> {
	config: TConfig;
	isValidLocale: (locale: string | undefined) => locale is LocaleCode<TConfig>;
	shouldIgnorePath: (pathname: string) => boolean;
	extractLocaleFromPath: (pathname: string) => LocaleCode<TConfig> | null;
	parseLocaleCookie: (
		cookieHeader: string | null,
	) => LocaleCode<TConfig> | null;
	createCookieHeader: (value: LocaleCode<TConfig>) => string;
	getLocaleFromRequest: (request: Request) => LocaleFromRequestResult;
	i18nServerEntry: (request: Request) => LocaleMiddlewareResult;
	i18nMiddleware: RequestMiddlewareAfterServer<
		Record<never, never>,
		undefined,
		{
			locale: string;
			i18n: I18n;
		}
	>;
	routerWithI18n: <TRouter extends AnyRouter>(
		router: TRouter,
		i18n: I18n,
		opts?: {
			WrapProvider?: (props: { children: ReactNode }) => JSX.Element;
		},
	) => TRouter;
	stripLocalePrefix: (pathname: string) => string;
	localizePath: (to: string) => string;
	LocalizedLink: ComponentType<LocalizedLinkProps>;
	useLocale: () => {
		currentLocale: LocaleCode<TConfig>;
		switchLocale: (locale: LocaleCode<TConfig>) => Promise<void>;
	};
	useLocalizedNavigate: () => (to: string) => void;
}
