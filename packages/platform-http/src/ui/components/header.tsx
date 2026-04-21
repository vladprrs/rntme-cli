import type { Organization } from '@rntme-cli/platform-core';

export type HeaderSubject = {
  readonly account: { readonly displayName: string };
  readonly org: { readonly id: string; readonly slug: string; readonly displayName: string };
};

export function Header(props: {
  subject: HeaderSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
}) {
  const { subject, otherOrgs } = props;
  return (
    <nav class="border-b border-gray-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div class="flex items-center gap-6">
          <a href="/" class="text-lg font-semibold tracking-tight text-gray-900">
            rntme
          </a>
          <div class="text-sm text-gray-600">
            <a href={`/${subject.org.slug}`} class="font-medium text-gray-900 hover:underline">
              {subject.org.displayName}
            </a>
            {otherOrgs.length > 0 && (
              <details class="relative ml-2 inline-block">
                <summary class="cursor-pointer text-xs text-gray-500 hover:text-gray-700">switch</summary>
                <ul class="absolute left-0 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white p-1 shadow-md">
                  {otherOrgs.map((o) => (
                    <li>
                      {/* TODO: once /v1/auth/login accepts org_id, pass o.id here — currently re-auths into the same org */}
                      <a
                        href="/v1/auth/login"
                        class="block rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {o.displayName}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div class="flex items-center gap-4 text-sm text-gray-600">
            <a href={`/${subject.org.slug}`} class="hover:text-gray-900">Projects</a>
            <a href={`/${subject.org.slug}/tokens`} class="hover:text-gray-900">Tokens</a>
            <a href={`/${subject.org.slug}/audit`} class="hover:text-gray-900">Audit</a>
          </div>
        </div>
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span>{subject.account.displayName}</span>
          <form method="post" action="/logout">
            <button type="submit" class="rounded border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
