import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<div
			className="flex h-full items-center justify-center pt-8"
			role="status"
			aria-label="Loading"
		>
			<Loader2
				aria-hidden="true"
				className="animate-spin motion-reduce:animate-none"
			/>
		</div>
	);
}
