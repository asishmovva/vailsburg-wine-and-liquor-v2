import { SignInForm } from "./SignInForm";

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = typeof searchParams?.next === "string" ? searchParams.next : "/";
  return <SignInForm nextPath={nextPath} />;
}
