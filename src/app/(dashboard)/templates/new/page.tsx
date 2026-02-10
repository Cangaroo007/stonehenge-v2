import TemplateEditor from '../components/TemplateEditor';

export default function NewTemplatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">New Template</h1>
      <TemplateEditor />
    </div>
  );
}
