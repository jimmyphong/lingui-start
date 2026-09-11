import type { I18n } from "@lingui/core";
import type { AnyRouter, FileRouteTypes, Link } from "@tanstack/react-router";
import type { RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type React from "react";
import type { ReactNode } from "react";
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

export type StripLocalePrefix<T extends string> = T extends "/{-$locale}"
	? "/"
	: T extends `/{-$locale}${infer Rest}`
		? Rest
		: never;

export type LocalizedFullPaths = Extract<
	FileRouteTypes["to"],
	`/{-$locale}${string}`
>;

export type LocalizedTo = StripLocalePrefix<LocalizedFullPaths>;

export type LocalizedDestination<TTo extends LocalizedTo> = TTo extends "/"
	? "/{-$locale}"
	: `/{-$locale}${TTo}`;

export type LocaleCode<TConfig extends LinguiStartConfig> =
	TConfig["locales"][number]["code"];

export type LocalizedLinkProps<TTo extends LocalizedTo = LocalizedTo> = {
	to: TTo;
} & Omit<
	React.ComponentProps<
		typeof Link<AnyRouter, string, LocalizedDestination<TTo>>
	>,
	"to"
>;

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
	setupI18n: () => I18n;
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
	LocalizedLink: <TTo extends LocalizedTo>(
		props: LocalizedLinkProps<TTo> & {
			ref?: React.Ref<HTMLAnchorElement>;
		},
	) => React.JSX.Element;
	useLocale: () => {
		currentLocale: LocaleCode<TConfig>;
		switchLocale: (
			locale: LocaleCode<TConfig>,
			redirectUrl?: string,
		) => Promise<void>;
	};
	useLocalizedNavigate: () => (to: string) => void;
}
