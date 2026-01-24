import { SignUpForm } from "./SignUpForm";

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = typeof searchParams?.next === "string" ? searchParams.next : "/";
  return <SignUpForm nextPath={nextPath} />;
}
