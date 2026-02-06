import Link from 'next/link';
import prisma from '@/lib/db';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getMaterials() {
  return prisma.material.findMany({
    orderBy: [{ collection: 'asc' }, { name: 'asc' }],
  });
}

export default async function MaterialsPage() {
  const materials = await getMaterials();

  // Group by collection
  const grouped = materials.reduce((acc, mat) => {
    const collection = mat.collection || 'Uncategorized';
    if (!acc[collection]) acc[collection] = [];
    acc[collection].push(mat);
    return acc;
  }, {} as Record<string, typeof materials>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
        <Link href="/materials/new" className="btn-primary">
          + New Material
        </Link>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">
            No materials yet.{' '}
            <Link href="/materials/new" className="text-primary-600 hover:text-primary-700">
              Add your first material
            </Link>
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([collection, mats]) => (
          <div key={collection} className="card">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-semibold">{collection}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Name</th>
                    <th className="table-header">Price per m²</th>
                    <th className="table-header">Status</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mats.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{material.name}</td>
                      <td className="table-cell">{formatCurrency(Number(material.pricePerSqm))}</td>
                      <td className="table-cell">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            material.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {material.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <Link
                          href={`/materials/${material.id}/edit`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
