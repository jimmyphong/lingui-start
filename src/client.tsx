import { useLingui } from "@lingui/react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { createLocaleUtils } from "./factory";
import type {
	ClientLinguiResult,
	LinguiStartConfig,
	LocaleCode,
} from "./types";

export function createClientLingui<TConfig extends LinguiStartConfig>(
	config: TConfig,
): ClientLinguiResult<TConfig> {
	const utils = createLocaleUtils(config);

	const LocalizedLink = ({
		to,
		...props
	}: React.ComponentProps<typeof Link> & { to: string }) => {
		return <Link to={utils.localizePath(to)} {...props} />;
	};

	const useLocale = () => {
		const router = useRouter();
		const { i18n } = useLingui();
		const currentLocale = (i18n.locale ||
			config.defaultLocale) as LocaleCode<TConfig>;

		const switchLocale = useCallback(
			async (newLocale: LocaleCode<TConfig>) => {
				if (newLocale === currentLocale || !utils.isValidLocale(newLocale))
					return;

				// biome-ignore lint/suspicious/noDocumentCookie: persist locale change
				document.cookie = utils.createCookieHeader(newLocale);
				const messages = await config.loadMessages(newLocale);
				i18n.loadAndActivate({ locale: newLocale, messages });
				document.documentElement.lang = newLocale;

				const basePath = utils.stripLocalePrefix(window.location.pathname);
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

	const useLocalizedNavigate = () => {
		const navigate = useNavigate();
		return useCallback(
			(to: string) => {
				navigate({ to: utils.localizePath(to) });
			},
			[navigate],
		);
	};

	return { ...utils, LocalizedLink, useLocale, useLocalizedNavigate };
}
