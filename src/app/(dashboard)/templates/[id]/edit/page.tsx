import prisma from '@/lib/db';
import { notFound } from 'next/navigation';
import TemplateEditor from '../../components/TemplateEditor';
import type { TemplateData } from '@/lib/types/unit-templates';

export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const templateId = parseInt(id, 10);

  if (isNaN(templateId)) {
    notFound();
  }

  const template = await prisma.unit_type_templates.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    notFound();
  }

  const templateData = template.templateData as unknown as TemplateData;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Edit Template</h1>
      <TemplateEditor
        templateId={template.id}
        initialData={{
          name: template.name,
          unitTypeCode: template.unitTypeCode,
          description: template.description || '',
          templateData,
        }}
      />
    </div>
  );
}
