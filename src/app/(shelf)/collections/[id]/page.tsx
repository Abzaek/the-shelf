import { CollectionDetailPage } from "@/components/collections/collection-detail-page";

export const metadata = { title: "Collection" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CollectionDetailPage id={id} />;
}
