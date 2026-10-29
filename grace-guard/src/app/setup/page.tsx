import { BrandMark } from "@/components/app/brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <BrandMark tone="dark" />
      <Card>
        <CardHeader>
          <CardTitle>Connect your Supabase project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>The app needs two environment variables before anyone can sign in:</p>
          <pre className="overflow-x-auto rounded-lg bg-navy p-4 text-xs text-ivory">
{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>`}
          </pre>
          <p>
            Locally, copy <code>.env.example</code> to <code>.env.local</code> and fill them in. On Vercel, add them under Project → Settings → Environment
            Variables, then redeploy. Full steps are in the README.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
