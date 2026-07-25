import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Checkbox } from "@blabla/ui/components/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@blabla/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@blabla/ui/components/select";
import { Separator } from "@blabla/ui/components/separator";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { Textarea } from "@blabla/ui/components/textarea";
import { cn } from "@blabla/ui/lib/utils";
import {
	createFileRoute,
	Link,
	useNavigate,
	useParams,
	useSearch,
} from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	Download,
	Inbox,
	Plus,
	Search,
	Sparkles,
	Tag as TagIcon,
	Upload,
	X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";
import {
	buildExportFileName,
	downloadExportFile,
	type ExportFormat,
} from "@/lib/export-download";

export const Route = createFileRoute("/projects/$projectId/strings")({
	validateSearch: (search: Record<string, unknown>) => ({
		tag: typeof search.tag === "string" ? search.tag : undefined,
	}),
	component: StringsRoute,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
	translated: "default",
	approved: "default",
	needs_review: "secondary",
	stale: "secondary",
	missing: "outline",
};

function StatusBadge({ status }: { status: string }) {
	const variant = STATUS_VARIANT[status] ?? "outline";
	return (
		<Badge variant={variant} className="capitalize">
			{status.replace(/_/g, " ")}
		</Badge>
	);
}

type Locale = {
	_id: string;
	code: string;
	label: string;
	isSource?: boolean;
};

type TranslationValue = {
	localeId: string;
	value: string;
	status: string;
};

type Tag = {
	_id: string;
	name: string;
	slug: string;
	color?: string;
};

type Screen = {
	_id: string;
	slug: string;
};

type TranslationKey = {
	_id: string;
	projectId: string;
	key: string;
	description?: string;
	tags?: Tag[];
};

function LocaleEditor({
	keyId,
	locale,
	initialValue,
	status,
}: {
	keyId: string;
	locale: Locale;
	initialValue: string;
	status: string;
}) {
	const updateValue = useMutation(api.values.updateManual);
	const [value, setValue] = useState(initialValue);
	const [saving, setSaving] = useState(false);
	const editedDuringSaveRef = useRef(false);

	useEffect(() => {
		if (saving || editedDuringSaveRef.current) {
			return;
		}
		setValue(initialValue);
	}, [initialValue, saving]);

	const dirty = value !== initialValue;

	async function save() {
		editedDuringSaveRef.current = false;
		setSaving(true);
		try {
			await updateValue({
				keyId: convexId<"translationKeys">(keyId),
				localeId: convexId<"locales">(locale._id),
				value,
			});
			toast.success(`${locale.code} saved`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not save ${locale.code}: ${error.message}`
					: `Could not save ${locale.code}`,
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			className={cn(
				"flex w-72 shrink-0 flex-col gap-1.5 rounded-md border bg-background p-2 transition-colors",
				locale.isSource && "border-brand/30 bg-brand/5",
				dirty && "border-ring/50 ring-1 ring-ring/20",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<span className="font-medium font-mono text-[11px]">
						{locale.code}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{locale.label}
					</span>
					{locale.isSource ? (
						<Sparkles
							role="img"
							aria-label="Source locale"
							className="size-3 text-brand"
						/>
					) : null}
				</div>
				<StatusBadge status={status} />
			</div>
			<Textarea
				className="min-h-16 text-xs leading-relaxed"
				aria-label={`${locale.label} value`}
				value={value}
				onChange={(event) => {
					if (saving) {
						editedDuringSaveRef.current = true;
					}
					setValue(event.target.value);
				}}
				placeholder="—"
				spellCheck={!locale.isSource}
				dir="auto"
			/>
			<div className="flex items-center justify-end gap-2">
				{dirty ? (
					<Button
						size="xs"
						variant="ghost"
						type="button"
						onClick={() => setValue(initialValue)}
						disabled={saving}
					>
						Reset
					</Button>
				) : null}
				<Button
					size="xs"
					type="button"
					onClick={save}
					disabled={!dirty || saving}
				>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}

function KeyRow({
	item,
	locales,
	allTags,
	valuesByLocale,
	selected,
	onSelectedChange,
	onFilterTag,
}: {
	item: TranslationKey;
	locales: Locale[];
	allTags: Tag[];
	valuesByLocale: Map<string, TranslationValue>;
	selected: boolean;
	onSelectedChange: (checked: boolean) => void;
	onFilterTag: (tag: Tag) => void;
}) {
	return (
		<Card
			size="sm"
			className={cn("transition-colors", selected && "ring-2 ring-ring/40")}
		>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-start gap-3">
					<div className="pt-1">
						<Checkbox
							aria-label={`Select ${item.key}`}
							checked={selected}
							onCheckedChange={(checked) => onSelectedChange(Boolean(checked))}
						/>
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<div className="truncate font-mono text-xs">{item.key}</div>
						{item.description ? (
							<div className="text-[11px] text-muted-foreground">
								{item.description}
							</div>
						) : null}
						{item.tags?.length ? (
							<KeyTagList
								item={item}
								allTags={allTags}
								onFilterTag={onFilterTag}
							/>
						) : null}
						<KeyTagComposer item={item} allTags={allTags} />
					</div>
				</div>
				<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
					{locales.map((locale) => {
						const stored = valuesByLocale.get(locale._id);
						return (
							<LocaleEditor
								key={locale._id}
								keyId={item._id}
								locale={locale}
								initialValue={stored?.value ?? ""}
								status={stored?.status ?? "missing"}
							/>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}

function KeyTagList({
	item,
	allTags,
	onFilterTag,
}: {
	item: TranslationKey;
	allTags: Tag[];
	onFilterTag: (tag: Tag) => void;
}) {
	const updateMetadata = useMutation(api.keys.updateMetadata);
	const [removingTagId, setRemovingTagId] = useState<string | null>(null);
	const itemTags = item.tags ?? [];

	async function removeTag(tag: Tag) {
		setRemovingTagId(tag._id);
		try {
			await updateMetadata({
				keyId: convexId<"translationKeys">(item._id),
				tagIds: itemTags
					.filter((currentTag) => currentTag._id !== tag._id)
					.map((currentTag) => convexId<"tags">(currentTag._id)),
			});
			toast.success(`Removed ${tag.slug}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not remove tag",
			);
		} finally {
			setRemovingTagId(null);
		}
	}

	return (
		<div className="flex flex-wrap gap-1">
			{itemTags.map((tag) => {
				const canonicalTag =
					allTags.find((option) => option._id === tag._id) ?? tag;
				return (
					<Badge
						key={tag._id}
						variant="outline"
						className="gap-1 px-1.5 font-normal"
					>
						<button
							type="button"
							className="font-mono hover:underline"
							onClick={() => onFilterTag(canonicalTag)}
							title={`Filter by ${tag.slug}`}
						>
							{tag.slug}
						</button>
						<button
							type="button"
							className="text-muted-foreground hover:text-foreground disabled:opacity-50"
							onClick={() => removeTag(canonicalTag)}
							disabled={removingTagId === tag._id}
							aria-label={`Remove ${tag.slug} from ${item.key}`}
						>
							<X data-icon="inline-end" />
						</button>
					</Badge>
				);
			})}
		</div>
	);
}

function KeyTagComposer({
	item,
	allTags,
}: {
	item: TranslationKey;
	allTags: Tag[];
}) {
	const updateMetadata = useMutation(api.keys.updateMetadata);
	const upsertTag = useMutation(api.tags.upsert);
	const [tagInput, setTagInput] = useState("");
	const [saving, setSaving] = useState(false);
	const itemTags = item.tags ?? [];
	const currentTagIds = new Set(itemTags.map((tag) => tag._id));
	const normalizedInput = tagInput.trim().toLowerCase();
	const suggestions = allTags
		.filter((tag) => !currentTagIds.has(tag._id))
		.filter((tag) =>
			normalizedInput
				? tag.slug.toLowerCase().includes(normalizedInput) ||
					tag.name.toLowerCase().includes(normalizedInput)
				: true,
		)
		.slice(0, 4);

	async function addTag(rawValue = tagInput) {
		const value = rawValue.trim();
		if (!value) return;
		setSaving(true);
		try {
			const existing = allTags.find(
				(tag) =>
					tag.slug.toLowerCase() === value.toLowerCase() ||
					tag.name.toLowerCase() === value.toLowerCase(),
			);
			const tagId =
				(existing?._id ? convexId<"tags">(existing._id) : undefined) ??
				(await upsertTag({
					projectId: convexId<"projects">(item.projectId),
					name: value,
				}));
			if (currentTagIds.has(tagId)) {
				setTagInput("");
				return;
			}
			await updateMetadata({
				keyId: convexId<"translationKeys">(item._id),
				tagIds: [
					...itemTags.map((tag) => convexId<"tags">(tag._id)),
					convexId<"tags">(tagId),
				],
			});
			setTagInput("");
			toast.success(`Added ${existing?.slug ?? value}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not add tag");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<InputGroup className="max-w-md">
				<InputGroupAddon>
					<TagIcon />
				</InputGroupAddon>
				<InputGroupInput
					name={`tag-${item._id}`}
					autoComplete="off"
					aria-label={`Add tag to ${item.key}`}
					value={tagInput}
					onChange={(event) => setTagInput(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addTag();
						}
					}}
					placeholder="Add or find tag…"
					disabled={saving}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						type="button"
						onClick={() => addTag()}
						disabled={!tagInput.trim() || saving}
					>
						<Plus data-icon="inline-start" />
						Add
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			{suggestions.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{suggestions.map((tag) => (
						<Button
							key={tag._id}
							type="button"
							size="xs"
							variant="ghost"
							onClick={() => addTag(tag.slug)}
						>
							{tag.slug}
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

function StringsSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			{[0, 1, 2, 3].map((index) => (
				<Skeleton key={index} className="h-32 w-full" />
			))}
		</div>
	);
}

function StringsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/strings" });
	const convexProjectId = convexId<"projects">(projectId);
	const search = useSearch({ from: "/projects/$projectId/strings" });
	const navigate = useNavigate({ from: "/projects/$projectId/strings" });
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const locales = useQuery(api.locales.list, { projectId: convexProjectId });
	const screens = useQuery(api.screens.list, { projectId: convexProjectId });
	const tags = useQuery(api.tags.list, { projectId: convexProjectId });
	const [screenId, setScreenId] = useState<string | undefined>(undefined);
	const [tagId, setTagId] = useState<string | undefined>(undefined);
	const [query, setQuery] = useState("");
	const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());
	const [batchTagId, setBatchTagId] = useState("");
	const [batchNewTags, setBatchNewTags] = useState("");

	const keys = useQuery(api.keys.list, {
		projectId: convexProjectId,
		screenId: screenId ? convexId<"screens">(screenId) : undefined,
		tagId: tagId ? convexId<"tags">(tagId) : undefined,
	});
	const keyRows = (keys ?? []) as TranslationKey[];
	const values = useQuery(
		api.values.listForKeys,
		keys === undefined
			? "skip"
			: {
					keyIds: keyRows.map((item) => convexId<"translationKeys">(item._id)),
				},
	);
	const valuesByKeyAndLocale = new Map<string, Map<string, TranslationValue>>();
	for (const value of (values ?? []) as (TranslationValue & {
		keyId: string;
	})[]) {
		const byLocale =
			valuesByKeyAndLocale.get(value.keyId) ??
			new Map<string, TranslationValue>();
		byLocale.set(value.localeId, value);
		valuesByKeyAndLocale.set(value.keyId, byLocale);
	}

	const orderedLocales: Locale[] = ((locales ?? []) as Locale[])
		.slice()
		.sort((a, b) => {
			if (a.isSource && !b.isSource) return -1;
			if (b.isSource && !a.isSource) return 1;
			return a.code.localeCompare(b.code);
		});

	const createKey = useMutation(api.keys.create);
	const addTagsBatch = useMutation(api.keys.addTagsBatch);
	const exportJson = useMutation(api.exports.startJsonExport);
	const exportArb = useMutation(api.exports.startArbExport);
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [isAddingKey, setIsAddingKey] = useState(false);
	const [selectedExportFormat, setSelectedExportFormat] =
		useState<ExportFormat>("json");
	const [selectedExportLocale, setSelectedExportLocale] = useState("");
	const tagOptions = (tags ?? []) as Tag[];

	useEffect(() => {
		if (tags === undefined) return;
		const nextTag = search.tag
			? tagOptions.find((tag) => tag.slug === search.tag)
			: undefined;
		setTagId(nextTag?._id);
	}, [search.tag, tags, tagOptions]);

	async function addKey(event: FormEvent) {
		event.preventDefault();
		if (!project?.sourceLocale?._id || !newKey.trim()) return;
		setIsAddingKey(true);
		try {
			await createKey({
				projectId: convexProjectId,
				key: newKey,
				initialValues: [
					{
						localeId: convexId<"locales">(project.sourceLocale._id),
						value: newValue,
					},
				],
			});
			setNewKey("");
			setNewValue("");
			toast.success("String created");
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not add string: ${error.message}`
					: "Could not add string. Check the key and try again.",
			);
		} finally {
			setIsAddingKey(false);
		}
	}

	const filteredKeys = keyRows.filter((item) =>
		query.trim() ? item.key.toLowerCase().includes(query.toLowerCase()) : true,
	);
	const hasActiveFilters = Boolean(screenId || tagId || query.trim());
	const selectedVisibleCount = filteredKeys.filter((item) =>
		selectedKeyIds.has(item._id),
	).length;
	const allVisibleSelected =
		filteredKeys.length > 0 && selectedVisibleCount === filteredKeys.length;
	const indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;

	function toggleVisibleKeys(checked: boolean) {
		setSelectedKeyIds((current) => {
			const next = new Set(current);
			for (const item of filteredKeys) {
				if (checked) next.add(item._id);
				else next.delete(item._id);
			}
			return next;
		});
	}

	async function applyBatchTags(event: FormEvent) {
		event.preventDefault();
		const tagSlugs = batchNewTags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
		const keyIds = Array.from(selectedKeyIds);
		if (keyIds.length === 0) {
			toast.error("Select at least one string");
			return;
		}
		if (!batchTagId && tagSlugs.length === 0) {
			toast.error("Choose or enter a tag");
			return;
		}
		try {
			const result = await addTagsBatch({
				projectId: convexProjectId,
				keyIds: keyIds.map((keyId) => convexId<"translationKeys">(keyId)),
				tagIds: batchTagId ? [convexId<"tags">(batchTagId)] : [],
				tagSlugs,
			});
			setSelectedKeyIds(new Set());
			setBatchTagId("");
			setBatchNewTags("");
			toast.success(`Tagged ${result.updated} strings`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not tag strings: ${error.message}`
					: "Could not tag strings",
			);
		}
	}

	async function downloadSelectedStrings() {
		const selectedKeys = filteredKeys
			.filter((item) => selectedKeyIds.has(item._id))
			.map((item) => item.key);
		if (selectedKeys.length === 0) {
			toast.error("Select at least one string");
			return;
		}
		if (!selectedExportLocale) {
			toast.error("Choose a locale");
			return;
		}
		const selection = { type: "keys" as const, keys: selectedKeys };
		try {
			const result =
				selectedExportFormat === "json"
					? await exportJson({
							projectId: convexProjectId,
							localeCode: selectedExportLocale,
							selection,
						})
					: await exportArb({
							projectId: convexProjectId,
							localeCode: selectedExportLocale,
							selection,
						});
			downloadExportFile({
				content: result.content ?? "",
				fileName: buildExportFileName({
					projectSlug: project?.slug ?? project?.name,
					localeCode: selectedExportLocale,
					scope: "selected",
					format: selectedExportFormat,
				}),
				format: selectedExportFormat,
			});
			toast.success("Selected strings downloaded");
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not download strings: ${error.message}`
					: "Could not download strings",
			);
		}
	}

	const screenOptions = (screens ?? []) as Screen[];

	function filterByTag(tag: Tag | undefined) {
		setTagId(tag?._id);
		navigate({
			search: (current) => ({
				...current,
				tag: tag?.slug,
			}),
			replace: true,
		});
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Strings"
				description="Edit every locale side by side. Each cell saves independently."
				action={
					orderedLocales.length > 0 ? (
						<Badge variant="secondary">
							{orderedLocales.length} locale
							{orderedLocales.length === 1 ? "" : "s"}
						</Badge>
					) : null
				}
			/>

			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form id="add-string" onSubmit={addKey}>
							<FieldGroup className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
								<Field>
									<FieldLabel htmlFor="new-string-key">Key</FieldLabel>
									<Input
										id="new-string-key"
										name="key"
										autoComplete="off"
										placeholder="checkout.payButton…"
										value={newKey}
										onChange={(event) => setNewKey(event.target.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="new-string-value">
										Source value
									</FieldLabel>
									<Input
										id="new-string-value"
										name="sourceValue"
										autoComplete="off"
										placeholder="Pay now…"
										value={newValue}
										onChange={(event) => setNewValue(event.target.value)}
									/>
								</Field>
								<Button
									type="submit"
									disabled={
										!newKey.trim() || !project?.sourceLocale?._id || isAddingKey
									}
								>
									<Plus data-icon="inline-start" />
									{isAddingKey ? "Adding…" : "Add string"}
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				<FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="strings-search">Search</FieldLabel>
						<div className="relative">
							<Search
								aria-hidden
								className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="strings-search"
								name="query"
								autoComplete="off"
								className="pl-7"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Find by key…"
							/>
						</div>
					</Field>
					<Field>
						<FieldLabel htmlFor="strings-screen">Screen</FieldLabel>
						<Select
							value={screenId ?? "__all__"}
							onValueChange={(next) =>
								setScreenId(
									next === "__all__" || next == null ? undefined : next,
								)
							}
						>
							<SelectTrigger id="strings-screen" className="w-full">
								<SelectValue placeholder="All screens" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__all__">All screens</SelectItem>
									{screenOptions.map((screen) => (
										<SelectItem key={screen._id} value={screen._id}>
											{screen.slug}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor="strings-tag">Tag</FieldLabel>
						<Select
							value={tagId ?? "__all__"}
							onValueChange={(next) =>
								filterByTag(
									next === "__all__" || next == null
										? undefined
										: tagOptions.find((tag) => tag._id === next),
								)
							}
						>
							<SelectTrigger id="strings-tag" className="w-full">
								<SelectValue placeholder="All tags" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__all__">All tags</SelectItem>
									{tagOptions.map((tag) => (
										<SelectItem key={tag._id} value={tag._id}>
											{tag.slug}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
				</FieldGroup>

				<Separator />

				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-2 text-xs">
						<Checkbox
							id="select-visible-strings"
							checked={allVisibleSelected}
							indeterminate={indeterminate}
							onCheckedChange={(checked) => toggleVisibleKeys(Boolean(checked))}
						/>
						<label htmlFor="select-visible-strings">
							{selectedKeyIds.size > 0
								? `${selectedKeyIds.size} selected`
								: `Select visible (${filteredKeys.length})`}
						</label>
					</div>
					<form
						onSubmit={applyBatchTags}
						className="flex flex-1 flex-wrap items-end gap-2"
					>
						<Select
							value={batchTagId || "__none__"}
							onValueChange={(value) =>
								setBatchTagId(
									value === "__none__" || value == null ? "" : value,
								)
							}
						>
							<SelectTrigger
								size="sm"
								className="min-w-40"
								aria-label="Existing tag"
							>
								<SelectValue placeholder="Existing tag" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">No existing tag</SelectItem>
									{tagOptions.map((tag) => (
										<SelectItem key={tag._id} value={tag._id}>
											{tag.slug}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Input
							name="batchTagSlugs"
							autoComplete="off"
							aria-label="New tag slugs"
							value={batchNewTags}
							onChange={(event) => setBatchNewTags(event.target.value)}
							placeholder="checkout, legal…"
							className="min-w-48 flex-1"
						/>
						<Button
							type="submit"
							size="sm"
							disabled={selectedKeyIds.size === 0}
						>
							<TagIcon data-icon="inline-start" />
							Add tags
						</Button>
					</form>
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={selectedExportFormat}
							onValueChange={(value) =>
								setSelectedExportFormat(value as ExportFormat)
							}
						>
							<SelectTrigger
								size="sm"
								className="w-28"
								aria-label="Export format"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="json">JSON</SelectItem>
									<SelectItem value="arb">ARB</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
						<Select
							value={selectedExportLocale}
							onValueChange={(value) => setSelectedExportLocale(value ?? "")}
						>
							<SelectTrigger
								size="sm"
								className="w-32"
								aria-label="Export locale"
							>
								<SelectValue placeholder="Locale" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{orderedLocales.map((locale) => (
										<SelectItem key={locale._id} value={locale.code}>
											{locale.code}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={selectedKeyIds.size === 0 || !selectedExportLocale}
							onClick={downloadSelectedStrings}
						>
							<Download data-icon="inline-start" />
							Download selected
						</Button>
					</div>
				</div>

				{keys === undefined ? (
					<StringsSkeleton />
				) : filteredKeys.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Inbox />
							</EmptyMedia>
							<EmptyTitle>
								{hasActiveFilters
									? "No strings match"
									: "Add your first strings"}
							</EmptyTitle>
							<EmptyDescription>
								{hasActiveFilters
									? "Clear the current search and filters to see all strings."
									: "Import an existing locale file, or add a string manually above."}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							{hasActiveFilters ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										setQuery("");
										setScreenId(undefined);
										filterByTag(undefined);
									}}
								>
									Clear filters
								</Button>
							) : (
								<>
									<Button
										render={
											<Link
												to="/projects/$projectId/import"
												params={{ projectId }}
											/>
										}
									>
										<Upload data-icon="inline-start" />
										Import strings
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={() =>
											document.getElementById("new-string-key")?.focus()
										}
									>
										<Plus data-icon="inline-start" />
										Add manually
									</Button>
								</>
							)}
						</EmptyContent>
					</Empty>
				) : (
					<div className="flex flex-col gap-2">
						{filteredKeys.map((item) => (
							<KeyRow
								key={item._id}
								item={item}
								locales={orderedLocales}
								allTags={tagOptions}
								valuesByLocale={
									valuesByKeyAndLocale.get(item._id) ??
									new Map<string, TranslationValue>()
								}
								selected={selectedKeyIds.has(item._id)}
								onFilterTag={filterByTag}
								onSelectedChange={(checked) =>
									setSelectedKeyIds((current) => {
										const next = new Set(current);
										if (checked) next.add(item._id);
										else next.delete(item._id);
										return next;
									})
								}
							/>
						))}
					</div>
				)}
			</div>
		</ProjectShell>
	);
}
