import { ShelfPage } from "@/components/shelf/shelf-page";

export const metadata = { title: "Reading" };

export default function ReadingPage() {
  return <ShelfPage filter="reading" title="Reading" />;
}
