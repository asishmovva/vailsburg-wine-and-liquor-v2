import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function SignUpPage() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Create account</h1>
        <p className="text-sm text-zinc-600">
          Join Vailsburg Wine & Liquor for faster reorders.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="name">
            Full name
          </label>
          <Input id="name" name="name" placeholder="Jane Doe" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="email">
            Email
          </label>
          <Input id="email" name="email" type="email" placeholder="you@email.com" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="password">
            Password
          </label>
          <Input id="password" name="password" type="password" placeholder="••••••••" />
        </div>
        <Button className="w-full">Create account</Button>
      </Card>

      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-zinc-900">
          Sign in
        </Link>
      </p>
    </div>
  );
}

