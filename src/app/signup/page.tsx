import { SignUpForm } from "./SignUpForm";

type SearchParams = { next?: string } | Promise<{ next?: string }> | undefined;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedParams = await Promise.resolve(searchParams);
  const nextPath =
    typeof resolvedParams?.next === "string" ? resolvedParams.next : "/";
  return <SignUpForm nextPath={nextPath} />;
}
