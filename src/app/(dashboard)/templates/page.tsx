import Link from 'next/link';
import prisma from '@/lib/db';
import { formatDate } from '@/lib/utils';
import type { TemplateData } from '@/lib/types/unit-templates';

export const dynamic = 'force-dynamic';

async function getTemplates() {
  return prisma.unit_type_templates.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });
}

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Unit Type Templates</h1>
        <Link href="/templates/new" className="btn-primary">
          + New Template
        </Link>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Type Code</th>
                <th className="table-header">Rooms</th>
                <th className="table-header">Pieces</th>
                <th className="table-header">Est. Area</th>
                <th className="table-header">Project</th>
                <th className="table-header">Version</th>
                <th className="table-header">Updated</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No templates yet.{' '}
                    <Link href="/templates/new" className="text-primary-600 hover:text-primary-700">
                      Create your first template
                    </Link>
                  </td>
                </tr>
              ) : (
                templates.map((template) => {
                  const td = template.templateData as unknown as TemplateData;
                  return (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{template.name}</td>
                      <td className="table-cell">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800">
                          {template.unitTypeCode}
                        </span>
                      </td>
                      <td className="table-cell">{td.rooms.length}</td>
                      <td className="table-cell">{td.totalPieces}</td>
                      <td className="table-cell">{td.estimatedArea_sqm.toFixed(2)} m²</td>
                      <td className="table-cell">{template.project?.name || '-'}</td>
                      <td className="table-cell">v{template.version}</td>
                      <td className="table-cell">{formatDate(template.updatedAt)}</td>
                      <td className="table-cell">
                        <div className="flex gap-2">
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="text-primary-600 hover:text-primary-700"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
