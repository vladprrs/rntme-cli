import { Layout } from '../layout.js';
import type { Organization } from '@rntme-cli/platform-core';

export function NoOrgPage(props: {
  orgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
}) {
  return (
    <Layout title="No organization" variant="public">
      <main class="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-700">
        <h1 class="text-xl font-semibold text-gray-900">You're not a member of any organization yet.</h1>
        <p class="mt-2">Ask an admin to invite you, or contact sales to create one.</p>

        {props.orgs.length > 0 && (
          <div class="mt-6">
            <p class="text-xs font-medium uppercase tracking-wide text-gray-500">Other orgs on this account</p>
            <ul class="mt-2 space-y-1">
              {props.orgs.map((o) => (
                <li>
                  {/* TODO: once /v1/auth/login accepts org_id, pass o.id here — currently re-auths into the same org */}
                  <a class="text-sm text-blue-700 hover:underline" href="/v1/auth/login">
                    {o.displayName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form method="post" action="/logout" class="mt-6">
          <button type="submit" class="text-xs text-gray-500 hover:text-gray-700 hover:underline">
            Sign out
          </button>
        </form>
      </main>
    </Layout>
  );
}
