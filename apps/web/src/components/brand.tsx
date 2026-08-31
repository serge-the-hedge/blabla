import { cn } from "@blabla/ui/lib/utils";

export function BrandMark({ className }: { className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex size-6 items-center justify-center rounded-md bg-brand text-brand-foreground",
				className,
			)}
			aria-hidden
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				className="size-3.5"
			>
				<title>blabla logo</title>
				<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
			</svg>
		</span>
	);
}

export function BrandWordmark({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-2", className)}>
			<BrandMark />
			<span className="font-semibold text-sm tracking-tight">blabla</span>
		</span>
	);
}
