import { RelativeTime } from '../components/relative-time.js';

export type TokenSummary = {
  id: string;
  name: string;
  prefix: string;
  scopes: readonly string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export function TokenRow(props: { orgSlug: string; token: TokenSummary; canManage: boolean }) {
  const { orgSlug, token, canManage } = props;
  const revoked = token.revokedAt !== null;
  return (
    <tr id={`token-${token.id}`} class={revoked ? 'opacity-60' : ''}>
      <td class="px-3 py-2 align-top">
        <div class="font-medium text-gray-900">{token.name}</div>
        <div class="text-xs text-gray-500">
          <code>{token.prefix}…</code>
        </div>
      </td>
      <td class="px-3 py-2 align-top text-xs text-gray-600">
        {token.scopes.join(', ')}
      </td>
      <td class="px-3 py-2 align-top text-sm">
        <RelativeTime value={token.lastUsedAt} />
      </td>
      <td class="px-3 py-2 align-top text-sm">
        <RelativeTime value={token.createdAt} />
      </td>
      <td class="px-3 py-2 align-top text-right">
        {revoked ? (
          <span class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
            revoked
          </span>
        ) : canManage ? (
          <button
            type="button"
            class="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            hx-delete={`/${orgSlug}/tokens/${token.id}`}
            hx-target={`#token-${token.id}`}
            hx-swap="outerHTML"
            hx-confirm="Revoke this token? This cannot be undone."
          >
            Revoke
          </button>
        ) : null}
      </td>
    </tr>
  );
}
