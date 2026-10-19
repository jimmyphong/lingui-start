export type Messages = Record<string, string>;

/**
 * One load per locale: a pending or finished load is shared, so a preload
 * (on hover, on a menu opening, on idle) and the switch that follows it
 * wait on the same request. A failed load is forgotten, so the next call
 * tries again.
 */
export interface MessageCache {
	/** The locale's messages, loaded once. */
	load(locale: string): Promise<Messages>;
	/** Starts loading the locale's messages; never rejects. */
	preload(locale: string): void;
	/** Records messages already in hand (the hydrated locale). */
	seed(locale: string, messages: Messages): void;
	/** Whether the locale's messages are loaded or loading. */
	has(locale: string): boolean;
}

export function createMessageCache(
	loadMessages: (locale: string) => Promise<Messages>,
): MessageCache {
	const entries = new Map<string, Promise<Messages>>();

	const load = (locale: string): Promise<Messages> => {
		const cached = entries.get(locale);
		if (cached) return cached;
		const pending = loadMessages(locale).catch((error: unknown) => {
			entries.delete(locale);
			throw error;
		});
		entries.set(locale, pending);
		return pending;
	};

	return {
		load,
		preload(locale) {
			load(locale).catch(() => {});
		},
		seed(locale, messages) {
			entries.set(locale, Promise.resolve(messages));
		},
		has(locale) {
			return entries.has(locale);
		},
	};
}
