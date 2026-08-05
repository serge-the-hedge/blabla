// PROTOTYPE ONLY — throwaway. Delete with the prototype route it serves.
import { Button } from "@blabla/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

export type PrototypeVariant = { key: string; name: string };

export function PrototypeVariantSwitcher({
	variants,
	current,
	onChange,
}: {
	variants: PrototypeVariant[];
	current: string;
	onChange: (key: string) => void;
}) {
	const index = Math.max(
		0,
		variants.findIndex((variant) => variant.key === current),
	);
	const step = (delta: number) => {
		const next = (index + delta + variants.length) % variants.length;
		onChange(variants[next].key);
	};

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}
			if (event.key === "ArrowLeft") step(-1);
			if (event.key === "ArrowRight") step(1);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	if (import.meta.env.PROD) return null;

	const active = variants[index];

	return (
		<div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-foreground/20 bg-foreground px-1.5 py-1.5 text-background shadow-lg">
			<Button
				size="icon-sm"
				variant="ghost"
				aria-label="Previous variant"
				className="rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => step(-1)}
			>
				<ChevronLeft />
			</Button>
			<span className="px-2 font-medium text-xs tabular-nums">
				{active.key} — {active.name}
			</span>
			<Button
				size="icon-sm"
				variant="ghost"
				aria-label="Next variant"
				className="rounded-full text-background hover:bg-background/20 hover:text-background"
				onClick={() => step(1)}
			>
				<ChevronRight />
			</Button>
		</div>
	);
}
