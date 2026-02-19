import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Company Settings Card */}
      <Link href="/settings/company" className="block">
        <div className="card p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Company Settings</h2>
              <p className="text-sm text-gray-600">
                Manage company details, branding, logo, and quote templates
              </p>
            </div>
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Quote Templates Card */}
      <Link href="/settings/quote-templates" className="block">
        <div className="card p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Quote PDF Templates</h2>
              <p className="text-sm text-gray-600">
                Customise PDF sections, branding, and create templates for different audiences
              </p>
            </div>
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </Link>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Company Name</label>
            <input
              type="text"
              className="input"
              defaultValue="Northcoast Stone Pty Ltd"
              disabled
            />
          </div>
          <div>
            <label className="label">ABN</label>
            <input
              type="text"
              className="input"
              defaultValue="57 120 880 355"
              disabled
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              type="text"
              className="input"
              defaultValue="0754767636"
              disabled
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="text"
              className="input"
              defaultValue="admin@northcoaststone.com.au"
              disabled
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <input
              type="text"
              className="input"
              defaultValue="20 Hitech Drive, KUNDA PARK Queensland 4556, Australia"
              disabled
            />
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-4">
          To change company details, edit the .env file and restart the application.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Quote Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Quote Prefix</label>
            <input type="text" className="input" defaultValue="Q-" disabled />
          </div>
          <div>
            <label className="label">Default Validity (days)</label>
            <input type="number" className="input" defaultValue="30" disabled />
          </div>
          <div>
            <label className="label">Deposit %</label>
            <input type="number" className="input" defaultValue="50" disabled />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Tax Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Tax Name</label>
            <input type="text" className="input" defaultValue="GST" disabled />
          </div>
          <div>
            <label className="label">Tax Rate (%)</label>
            <input type="number" className="input" defaultValue="10" disabled />
          </div>
        </div>
      </div>

      <div className="card p-6 bg-blue-50 border-blue-200">
        <h2 className="text-lg font-semibold mb-2 text-blue-900">MVP Note</h2>
        <p className="text-sm text-blue-800">
          Settings are currently read-only in this MVP version. Full settings management 
          will be available in a future update. For now, settings can be changed by editing 
          the environment variables in your .env file.
        </p>
      </div>
    </div>
  );
}
