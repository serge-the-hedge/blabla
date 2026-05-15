import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import { Input } from "@blabla/ui/components/input";
import { Label } from "@blabla/ui/components/label";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/strings")({
	component: StringsRoute,
});

function StringRow({
	item,
	sourceValue,
	localeId,
}: {
	item: any;
	sourceValue?: string;
	localeId?: string;
}) {
	const updateValue = useMutation(apiAny.values.updateManual);
	const [value, setValue] = useState(item.selectedValue?.value ?? "");

	async function save() {
		if (!localeId) return;
		await updateValue({ keyId: item._id, localeId, value });
		toast.success("String updated");
	}

	return (
		<Card size="sm">
			<CardContent className="grid grid-cols-[minmax(160px,240px)_1fr_1fr_110px] gap-3">
				<div className="min-w-0">
					<div className="truncate font-mono text-xs">{item.key}</div>
					<div className="mt-1 text-[11px] text-muted-foreground">
						{item.description}
					</div>
				</div>
				<div className="min-w-0 whitespace-pre-wrap rounded-sm border bg-muted/20 p-2 text-xs">
					{sourceValue ?? ""}
				</div>
				<textarea
					className="min-h-16 rounded-sm border bg-background p-2 text-xs outline-none focus:border-ring"
					value={value}
					onChange={(event) => setValue(event.target.value)}
				/>
				<div className="flex flex-col items-end gap-2">
					<span className="text-[11px] text-muted-foreground">
						{item.selectedValue?.status ?? "missing"}
					</span>
					<Button size="sm" type="button" onClick={save} disabled={!localeId}>
						Save
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function StringsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/strings" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const screens = useQuery(apiAny.screens.list, { projectId });
	const tags = useQuery(apiAny.tags.list, { projectId });
	const [localeId, setLocaleId] = useState<string | undefined>(undefined);
	const [screenId, setScreenId] = useState<string | undefined>(undefined);
	const [tagId, setTagId] = useState<string | undefined>(undefined);
	const [query, setQuery] = useState("");
	const activeLocaleId = localeId ?? project?.sourceLocale?._id;
	const keys = useQuery(apiAny.keys.list, {
		projectId,
		localeId: activeLocaleId,
		screenId,
		tagId,
	});
	const sourceKeys = useQuery(apiAny.keys.list, {
		projectId,
		localeId: project?.sourceLocale?._id,
	});
	const sourceByKey = useMemo(
		() =>
			new Map(
				(sourceKeys ?? []).map((item: any) => [
					item._id,
					item.selectedValue?.value ?? "",
				]),
			),
		[sourceKeys],
	);
	const createKey = useMutation(apiAny.keys.create);
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");

	async function addKey(event: React.FormEvent) {
		event.preventDefault();
		if (!project?.sourceLocale?._id) return;
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

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Strings"
				description="Browse, filter, and edit project-localized copy."
			/>
			<form
				onSubmit={addKey}
				className="mb-4 grid grid-cols-[1fr_1fr_auto] gap-2 border p-3"
			>
				<Input
					placeholder="checkout.payButton"
					value={newKey}
					onChange={(event) => setNewKey(event.target.value)}
				/>
				<Input
					placeholder="Source value"
					value={newValue}
					onChange={(event) => setNewValue(event.target.value)}
				/>
				<Button type="submit">Add key</Button>
			</form>
			<div className="mb-4 grid grid-cols-4 gap-2">
				<div className="flex flex-col gap-1">
					<Label>Search</Label>
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label>Locale</Label>
					<select
						className="h-8 border bg-background px-2 text-xs"
						value={activeLocaleId ?? ""}
						onChange={(event) => setLocaleId(event.target.value)}
					>
						{(locales ?? []).map((locale: any) => (
							<option key={locale._id} value={locale._id}>
								{locale.code}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<Label>Screen</Label>
					<select
						className="h-8 border bg-background px-2 text-xs"
						value={screenId ?? ""}
						onChange={(event) => setScreenId(event.target.value || undefined)}
					>
						<option value="">All screens</option>
						{(screens ?? []).map((screen: any) => (
							<option key={screen._id} value={screen._id}>
								{screen.slug}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<Label>Tag</Label>
					<select
						className="h-8 border bg-background px-2 text-xs"
						value={tagId ?? ""}
						onChange={(event) => setTagId(event.target.value || undefined)}
					>
						<option value="">All tags</option>
						{(tags ?? []).map((tag: any) => (
							<option key={tag._id} value={tag._id}>
								{tag.slug}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				{filteredKeys.map((item: any) => (
					<StringRow
						key={item._id}
						item={item}
						sourceValue={sourceByKey.get(item._id) as string | undefined}
						localeId={activeLocaleId}
					/>
				))}
				{filteredKeys.length === 0 ? (
					<div className="border p-6 text-muted-foreground text-sm">
						No strings match this filter.
					</div>
				) : null}
			</div>
		</ProjectShell>
	);
}
