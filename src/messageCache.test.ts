import { describe, expect, mock, test } from "bun:test";
import { createMessageCache } from "./messageCache";

describe("createMessageCache", () => {
	test("a preload and the switch after it share one load", async () => {
		const load = mock(async (locale: string) => ({ hello: `hi ${locale}` }));
		const cache = createMessageCache(load);
		cache.preload("vi");
		expect(cache.has("vi")).toBe(true);
		const [a, b] = await Promise.all([cache.load("vi"), cache.load("vi")]);
		expect(a).toEqual({ hello: "hi vi" });
		expect(b).toBe(a);
		expect(load).toHaveBeenCalledTimes(1);
	});

	test("a seeded locale never loads", async () => {
		const load = mock(async () => ({}));
		const cache = createMessageCache(load);
		cache.seed("en", { hello: "hi" });
		expect(await cache.load("en")).toEqual({ hello: "hi" });
		expect(load).not.toHaveBeenCalled();
	});

	test("a failed load is forgotten; a preload never rejects", async () => {
		let fail = true;
		const load = mock(async () => {
			if (fail) throw new Error("offline");
			return { ok: "yes" };
		});
		const cache = createMessageCache(load);
		cache.preload("ko");
		// The switch joins the failing preload instead of loading again.
		await expect(cache.load("ko")).rejects.toThrow("offline");
		expect(load).toHaveBeenCalledTimes(1);
		expect(cache.has("ko")).toBe(false);
		fail = false;
		expect(await cache.load("ko")).toEqual({ ok: "yes" });
		expect(load).toHaveBeenCalledTimes(2);
	});
});
