import { TokenRow, type TokenSummary } from './token-row.js';

/**
 * Response fragment for POST /:orgSlug/tokens.
 *
 * Returns two pieces in one response:
 *   1. A new <tr> appended by htmx to the tokens tbody (primary swap).
 *   2. An out-of-band banner containing the plaintext, inserted into the
 *      #token-created sibling container. Plaintext is shown ONCE here and
 *      never stored anywhere else.
 */
export function TokenCreated(props: {
  orgSlug: string;
  token: TokenSummary;
  plaintext: string;
}) {
  return (
    <>
      <TokenRow orgSlug={props.orgSlug} token={props.token} canManage={true} />
      <div hx-swap-oob="innerHTML:#token-created">
        <div
          role="alert"
          class="mb-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p class="font-medium">Save this token now — it won't be shown again.</p>
          <div class="mt-2">
            <code class="block overflow-x-auto rounded bg-white px-2 py-1 font-mono text-xs">
              {props.plaintext}
            </code>
          </div>
        </div>
      </div>
    </>
  );
}
