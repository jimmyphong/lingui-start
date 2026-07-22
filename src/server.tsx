import type { I18n } from "@lingui/core";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { AnyRouter } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { createLocaleUtils } from "./factory";
import type { LinguiStartConfig, ServerLinguiResult } from "./types";

export function createServerLingui<TConfig extends LinguiStartConfig>(
	config: TConfig,
): ServerLinguiResult<TConfig> {
	const utils = createLocaleUtils(config);

	const i18nServerEntry = (request: Request) => {
		const url = new URL(request.url);
		const { pathname } = url;

		if (utils.shouldIgnorePath(pathname)) return {};
		if (
			pathname.startsWith(`/${config.defaultLocale}/`) ||
			pathname === `/${config.defaultLocale}`
		) {
			url.pathname = pathname.replace(`/${config.defaultLocale}`, "") || "/";
			return { redirect: Response.redirect(url.toString(), 301) };
		}

		const urlLocale = utils.extractLocaleFromPath(pathname);

		if (urlLocale) {
			const stripped = pathname.replace(`/${urlLocale}`, "") || "/";
			if (utils.shouldIgnorePath(stripped)) {
				url.pathname = stripped;
				return { redirect: Response.redirect(url.toString(), 301) };
			}

			const cookieLocale = utils.parseLocaleCookie(
				request.headers.get("cookie"),
			);
			if (urlLocale !== cookieLocale) {
				const cookieName = config.cookieName || "locale";
				return { setCookie: { name: cookieName, value: urlLocale } };
			}
		}

		return {};
	};

	const i18nMiddleware = createMiddleware({ type: "request" }).server(
		async ({ request, next }) => {
			const { locale, headers } = utils.getLocaleFromRequest(request);

			const i18n = setupI18n();
			const messages = await config.loadMessages(locale);
			i18n.loadAndActivate({ locale, messages });

			const result = await next({
				context: { locale, i18n },
			});

			if (headers) {
				headers.forEach(({ key, value }) => {
					result.response.headers.append(key, value);
				});
			}

			return result;
		},
	);

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
			context: { ...options.context, i18n },
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
					dehydratedI18n: { locale: i18n.locale, messages: i18n.messages },
				};
			};
		} else {
			router.options.hydrate = async (dehydrated: unknown) => {
				options.hydrate?.(dehydrated as never);
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

	return { ...utils, i18nServerEntry, i18nMiddleware, routerWithI18n };
}
