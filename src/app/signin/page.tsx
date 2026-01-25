import { SignInForm } from "./SignInForm";

type SearchParams = { next?: string } | Promise<{ next?: string }> | undefined;

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedParams = await Promise.resolve(searchParams);
  const nextPath =
    typeof resolvedParams?.next === "string" ? resolvedParams.next : "/";
  return <SignInForm nextPath={nextPath} />;
}
