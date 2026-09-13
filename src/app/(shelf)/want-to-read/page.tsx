import { ShelfPage } from "@/components/shelf/shelf-page";

export const metadata = { title: "Want to Read" };

export default function WantToReadPage() {
  return <ShelfPage filter="want-to-read" title="Want to Read" />;
}
