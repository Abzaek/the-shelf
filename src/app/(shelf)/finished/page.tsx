import { ShelfPage } from "@/components/shelf/shelf-page";

export const metadata = { title: "Finished" };

export default function FinishedPage() {
  return <ShelfPage filter="finished" title="Finished" />;
}
