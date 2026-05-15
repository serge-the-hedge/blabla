export type ExportFormat = "json" | "arb";

export function exportExtension(format: ExportFormat) {
	return format === "arb" ? "arb" : "json";
}

export function exportMimeType(format: ExportFormat) {
	return format === "arb" ? "application/json" : "application/json";
}

export function buildExportFileName(parts: {
	projectSlug?: string;
	localeCode?: string;
	scope?: string;
	format: ExportFormat;
}) {
	const nameParts = [
		parts.projectSlug ?? "strings",
		parts.localeCode,
		parts.scope,
	]
		.filter(Boolean)
		.map((part) =>
			String(part)
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9._-]+/g, "-")
				.replace(/^-+|-+$/g, ""),
		)
		.filter(Boolean);
	return `${nameParts.join("-") || "strings"}.${exportExtension(parts.format)}`;
}

export function downloadExportFile(args: {
	content: string;
	fileName: string;
	format: ExportFormat;
}) {
	const blob = new Blob([args.content], {
		type: `${exportMimeType(args.format)};charset=utf-8`,
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = args.fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
