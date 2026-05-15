import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/sign-in")({
	component: SignInRoute,
});

function SignInRoute() {
	const [signIn, setSignIn] = useState(true);
	return signIn ? (
		<SignInForm onSwitchToSignUp={() => setSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setSignIn(true)} />
	);
}
