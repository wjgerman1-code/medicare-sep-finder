"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { initializeWorkspace } from "@/lib/actions/settings";

export function NoCampaign() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <EmptyState icon={Sparkles} title="No campaigns yet">
      <p className="mb-4">Set up the 2026 Medicare AEP campaign with its dated Oct 28 baseline, default products and lead sources.</p>
      <Button
        variant="gold"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await initializeWorkspace();
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            }
            else toast.error(r.message);
          })
        }
      >
        Initialize workspace
      </Button>
    </EmptyState>
  );
}
