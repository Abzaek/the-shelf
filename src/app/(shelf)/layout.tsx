import { AppShell } from "@/components/shelf/app-shell";

export default function ShelfLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
