import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-14 w-full max-w-[1600px] items-center px-4 sm:px-6 lg:px-8">
        <Link href="/login" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="The Shelf">
          <BookOpen className="size-[18px] text-brass" strokeWidth={1.75} aria-hidden />
          <span className="font-serif text-[19px] font-medium tracking-tight">The Shelf</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-24 pt-6">{children}</main>
    </div>
  );
}
