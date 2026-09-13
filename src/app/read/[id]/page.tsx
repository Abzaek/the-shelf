import { ReaderRoute } from "@/components/reader/reader-route";

export const metadata = { title: "Reading" };

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReaderRoute bookId={id} />;
}
