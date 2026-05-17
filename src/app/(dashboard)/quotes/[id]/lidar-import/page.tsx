import LidarImportClient from './LidarImportClient';

export default async function LidarImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LidarImportClient quoteId={id} />;
}
