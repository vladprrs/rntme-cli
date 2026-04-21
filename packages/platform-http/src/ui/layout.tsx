import type { JSX } from 'hono/jsx/jsx-runtime';
import type { AuthSubject, Organization } from '@rntme-cli/platform-core';
import { Header } from './components/header.js';

type LayoutBase = {
  title: string;
  children: unknown;
  flash?: string | undefined;
};

type LayoutAuthed = LayoutBase & {
  variant: 'authed';
  subject: AuthSubject;
  otherOrgs: readonly Pick<Organization, 'id' | 'slug' | 'displayName'>[];
};

type LayoutPublic = LayoutBase & {
  variant?: 'public' | undefined;
};

type LayoutProps = LayoutAuthed | LayoutPublic;

export function Layout(props: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} · rntme</title>
        <script src="https://cdn.tailwindcss.com" />
        <script
          src="https://unpkg.com/htmx.org@2.0.3"
          integrity="sha384-0895/pl2MU10Hqc6jd4RvrthNlDiE9U1tWmX7WRESftEDRosgxNsQG/Ze9YMRzHq"
          crossorigin="anonymous"
        />
      </head>
      <body class="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {props.variant === 'authed' && <Header subject={props.subject as never} otherOrgs={props.otherOrgs} />}
        {props.flash && <FlashBanner code={props.flash} />}
        <div class="mx-auto max-w-5xl px-4 py-8">{props.children as JSX.Element}</div>
      </body>
    </html>
  );
}

function FlashBanner(props: { code: string }) {
  const text = flashText(props.code);
  if (!text) return null;
  return (
    <div role="status" class="mx-auto max-w-5xl px-4 pt-4">
      <div class="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{text}</div>
    </div>
  );
}

function flashText(code: string): string | null {
  switch (code) {
    case 'auth-failed':
      return 'Sign-in failed. Please try again.';
    case 'signed-out':
      return 'You have been signed out.';
    case 'token-revoked':
      return 'Token revoked.';
    case 'no-org':
      return 'Your account is not a member of any organization yet. Ask an admin to invite you, then sign in again.';
    default:
      return null;
  }
}
