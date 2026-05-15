import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Checkbox } from "@blabla/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
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
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Inbox, Plus, Search, Sparkles, Tag as TagIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/strings")({
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
	const updateValue = useMutation(apiAny.values.updateManual);
	const [value, setValue] = useState(initialValue);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);

	const dirty = value !== initialValue;

	async function save() {
		setSaving(true);
		try {
			await updateValue({ keyId, localeId: locale._id, value });
			toast.success(`${locale.code} saved`);
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
					<span className="font-mono font-medium text-[11px]">
						{locale.code}
					</span>
					<span className="truncate text-[10px] text-muted-foreground">
						{locale.label}
					</span>
					{locale.isSource ? (
						<Sparkles
							aria-label="Source locale"
							className="size-3 text-brand"
						/>
					) : null}
				</div>
				<StatusBadge status={status} />
			</div>
			<Textarea
				className="min-h-16 text-xs leading-relaxed"
				value={value}
				onChange={(event) => setValue(event.target.value)}
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
	selected,
	onSelectedChange,
}: {
	item: any;
	locales: Locale[];
	selected: boolean;
	onSelectedChange: (checked: boolean) => void;
}) {
	const values = useQuery(apiAny.values.listForKey, { keyId: item._id });
	const valuesByLocale = new Map(
		(values ?? []).map((value: any) => [value.localeId, value]),
	);

	return (
		<Card
			size="sm"
			className={cn(
				"transition-colors",
				selected && "ring-2 ring-ring/40",
			)}
		>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-start gap-3">
					<div className="pt-1">
						<Checkbox
							aria-label={`Select ${item.key}`}
							checked={selected}
							onCheckedChange={(checked) =>
								onSelectedChange(Boolean(checked))
							}
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
							<div className="flex flex-wrap gap-1">
								{item.tags.map((tag: any) => (
									<Badge
										key={tag._id}
										variant="outline"
										className="font-normal"
									>
										{tag.slug}
									</Badge>
								))}
							</div>
						) : null}
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
								initialValue={(stored as any)?.value ?? ""}
								status={(stored as any)?.status ?? "missing"}
							/>
						);
					})}
				</div>
			</CardContent>
		</Card>
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
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const screens = useQuery(apiAny.screens.list, { projectId });
	const tags = useQuery(apiAny.tags.list, { projectId });
	const [screenId, setScreenId] = useState<string | undefined>(undefined);
	const [tagId, setTagId] = useState<string | undefined>(undefined);
	const [query, setQuery] = useState("");
	const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());
	const [batchTagId, setBatchTagId] = useState("");
	const [batchNewTags, setBatchNewTags] = useState("");

	const keys = useQuery(apiAny.keys.list, {
		projectId,
		screenId,
		tagId,
	});

	const orderedLocales: Locale[] = (locales ?? [])
		.slice()
		.sort((a: any, b: any) => {
			if (a.isSource && !b.isSource) return -1;
			if (b.isSource && !a.isSource) return 1;
			return a.code.localeCompare(b.code);
		});

	const createKey = useMutation(apiAny.keys.create);
	const addTagsBatch = useMutation(apiAny.keys.addTagsBatch);
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");

	async function addKey(event: React.FormEvent) {
		event.preventDefault();
		if (!project?.sourceLocale?._id || !newKey.trim()) return;
		await createKey({
			projectId,
			key: newKey,
			initialValues: [{ localeId: project.sourceLocale._id, value: newValue }],
		});
		setNewKey("");
		setNewValue("");
		toast.success("String created");
	}

	const filteredKeys = (keys ?? []).filter((item: any) =>
		query.trim() ? item.key.toLowerCase().includes(query.toLowerCase()) : true,
	);
	const selectedVisibleCount = filteredKeys.filter((item: any) =>
		selectedKeyIds.has(item._id),
	).length;
	const allVisibleSelected =
		filteredKeys.length > 0 && selectedVisibleCount === filteredKeys.length;
	const indeterminate =
		selectedVisibleCount > 0 && !allVisibleSelected;

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

	async function applyBatchTags(event: React.FormEvent) {
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
		const result = await addTagsBatch({
			projectId,
			keyIds,
			tagIds: batchTagId ? [batchTagId] : [],
			tagSlugs,
		});
		setSelectedKeyIds(new Set());
		setBatchTagId("");
		setBatchNewTags("");
		toast.success(`Tagged ${result.updated} strings`);
	}

	const screenOptions = screens ?? [];
	const tagOptions = tags ?? [];

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
						<form
							onSubmit={addKey}
							className="grid grid-cols-[1fr_1fr_auto] gap-2"
						>
							<Input
								placeholder="key.path (e.g. checkout.payButton)"
								value={newKey}
								onChange={(event) => setNewKey(event.target.value)}
							/>
							<Input
								placeholder="Source value"
								value={newValue}
								onChange={(event) => setNewValue(event.target.value)}
							/>
							<Button type="submit" disabled={!newKey.trim()}>
								<Plus data-icon="inline-start" />
								Add string
							</Button>
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
									{screenOptions.map((screen: any) => (
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
								setTagId(
									next === "__all__" || next == null ? undefined : next,
								)
							}
						>
							<SelectTrigger id="strings-tag" className="w-full">
								<SelectValue placeholder="All tags" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__all__">All tags</SelectItem>
									{tagOptions.map((tag: any) => (
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
					<label className="flex items-center gap-2 text-xs">
						<Checkbox
							checked={allVisibleSelected}
							indeterminate={indeterminate}
							onCheckedChange={(checked) =>
								toggleVisibleKeys(Boolean(checked))
							}
						/>
						<span>
							{selectedKeyIds.size > 0
								? `${selectedKeyIds.size} selected`
								: `Select visible (${filteredKeys.length})`}
						</span>
					</label>
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
							<SelectTrigger size="sm" className="min-w-40">
								<SelectValue placeholder="Existing tag" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">No existing tag</SelectItem>
									{tagOptions.map((tag: any) => (
										<SelectItem key={tag._id} value={tag._id}>
											{tag.slug}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Input
							value={batchNewTags}
							onChange={(event) => setBatchNewTags(event.target.value)}
							placeholder="New tag slugs (comma-separated)"
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
				</div>

				{keys === undefined ? (
					<StringsSkeleton />
				) : filteredKeys.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Inbox />
							</EmptyMedia>
							<EmptyTitle>No strings here</EmptyTitle>
							<EmptyDescription>
								Adjust the filters above, or add a new key.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex flex-col gap-2">
						{filteredKeys.map((item: any) => (
							<KeyRow
								key={item._id}
								item={item}
								locales={orderedLocales}
								selected={selectedKeyIds.has(item._id)}
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
