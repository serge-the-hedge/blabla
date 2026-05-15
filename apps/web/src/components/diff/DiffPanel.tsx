import { Button } from "@blabla/ui/components/button";
import { parsePatchFiles } from "@pierre/diffs";
import {
	FileDiff,
	type FileDiffMetadata,
	Virtualizer,
} from "@pierre/diffs/react";
import { useMemo, useState } from "react";

import { buildPatchCacheKey } from "@/lib/diffRendering";
import { DiffPanelShell } from "./DiffPanelShell";

function renderableFiles(patch: string): FileDiffMetadata[] {
	const parsed = parsePatchFiles(patch.trim(), buildPatchCacheKey(patch));
	return parsed.flatMap((part) => part.files);
}

export function DiffPanel({ patch }: { patch: string }) {
	const [split, setSplit] = useState(false);
	const [wrap, setWrap] = useState(true);
	const files = useMemo(() => {
		try {
			return renderableFiles(patch);
		} catch {
			return null;
		}
	}, [patch]);

	return (
		<DiffPanelShell
			header={
				<>
					<div className="font-medium text-sm">Patch</div>
					<div className="flex gap-1">
						<Button
							size="sm"
							variant={split ? "default" : "outline"}
							onClick={() => setSplit(!split)}
						>
							Split
						</Button>
						<Button
							size="sm"
							variant={wrap ? "default" : "outline"}
							onClick={() => setWrap(!wrap)}
						>
							Wrap
						</Button>
					</div>
				</>
			}
		>
			{!patch.trim() ? (
				<div className="p-4 text-muted-foreground text-sm">
					No patch available.
				</div>
			) : files === null ? (
				<pre className="overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">
					{patch}
				</pre>
			) : (
				<Virtualizer className="h-full overflow-auto p-2">
					{files.map((file) => (
						<div
							key={file.cacheKey ?? `${file.name}-${file.prevName}`}
							className="mb-2 overflow-hidden border"
						>
							<FileDiff
								fileDiff={file}
								options={{
									diffStyle: split ? "split" : "unified",
									lineDiffType: "none",
									overflow: wrap ? "wrap" : "scroll",
									theme: "pierre-light",
									themeType: "light",
								}}
							/>
						</div>
					))}
				</Virtualizer>
			)}
		</DiffPanelShell>
	);
}
