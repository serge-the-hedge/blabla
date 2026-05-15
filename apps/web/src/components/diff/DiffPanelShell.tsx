import type { ReactNode } from "react";

export function DiffPanelShell({
	header,
	children,
}: {
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-[520px] flex-col overflow-hidden border bg-background">
			<div className="flex min-h-12 items-center justify-between gap-2 border-b px-3">
				{header}
			</div>
			<div className="min-h-0 flex-1 overflow-auto">{children}</div>
		</div>
	);
}
