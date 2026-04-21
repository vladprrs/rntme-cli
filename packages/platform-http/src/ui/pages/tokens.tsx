import { Layout } from '../layout.js';
import { EmptyState } from '../components/empty-state.js';
import type { Organization } from '@rntme-cli/platform-core';
import { TokenRow, type TokenSummary } from '../fragments/token-row.js';
import { hasScope } from '../scopes.js';
import type { EnrichedSubject } from './org.js';

export function TokensPage(props: {
  subject: EnrichedSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
  tokens: readonly TokenSummary[];
  flash?: string | undefined;
}) {
  const { subject, tokens } = props;
  const canManage = hasScope(subject, 'token:manage');
  const orgSlug = subject.org.slug;

  return (
    <Layout title="Tokens" variant="authed" subject={subject as never} otherOrgs={props.otherOrgs} flash={props.flash}>
      <header class="mb-6">
        <h1 class="text-xl font-semibold tracking-tight">API tokens</h1>
        <p class="text-sm text-gray-600">
          Personal access tokens for CLI and CI. The plaintext is shown once at creation.
        </p>
      </header>

      {canManage && (
        <form
          class="mb-6 rounded-md border border-gray-200 bg-white p-4"
          hx-post={`/${orgSlug}/tokens`}
          hx-target="#tokens-tbody"
          hx-swap="afterbegin"
        >
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label class="flex flex-col text-sm">
              <span class="text-gray-700">Name</span>
              <input
                type="text"
                name="name"
                required
                placeholder="ci, laptop, …"
                class="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label class="flex flex-col text-sm sm:col-span-2">
              <span class="text-gray-700">Scopes (comma-separated)</span>
              <input
                type="text"
                name="scopes"
                required
                placeholder="project:read,project:write,version:publish"
                class="mt-1 rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              />
            </label>
          </div>
          <div class="mt-3 flex justify-end">
            <button
              type="submit"
              class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 [.htmx-request]:opacity-60"
            >
              Create token
            </button>
          </div>
        </form>
      )}

      <div id="token-created" aria-live="polite"></div>

      {tokens.length === 0 ? (
        <EmptyState title="No tokens yet." />
      ) : (
        <div class="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" class="px-3 py-2 font-medium">Name</th>
                <th scope="col" class="px-3 py-2 font-medium">Scopes</th>
                <th scope="col" class="px-3 py-2 font-medium">Last used</th>
                <th scope="col" class="px-3 py-2 font-medium">Created</th>
                <th scope="col" class="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody id="tokens-tbody" class="divide-y divide-gray-100">
              {tokens.map((t) => (
                <TokenRow orgSlug={orgSlug} token={t} canManage={canManage} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
