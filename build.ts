import { build } from "bun";

const main = async () => {
	await build({
		entrypoints: ["./src/index.ts"],
		outdir: "./dist",
		target: "browser",
		format: "esm",
		splitting: false,
		sourcemap: "external",
		external: [
			"react",
			"react-dom",
			"@lingui/core",
			"@lingui/react",
			"@tanstack/react-router",
			"@tanstack/react-start",
		],
		minify: true,
	});

	const proc = Bun.spawn(
		[
			"bunx",
			"tsc",
			"--emitDeclarationOnly",
			"--declaration",
			"--outDir",
			"dist",
		],
		{
			cwd: process.cwd(),
			stdio: ["inherit", "inherit", "inherit"],
		},
	);

	const exitCode = await proc.exited;
	if (exitCode !== 0) process.exit(exitCode);
};

await main();
