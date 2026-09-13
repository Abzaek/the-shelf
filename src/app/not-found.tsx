import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-serif text-[32px] font-medium tracking-tight">This page isn’t on the shelf.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Back to your library</Link>
      </Button>
    </main>
  );
}
