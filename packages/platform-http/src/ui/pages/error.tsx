import { Layout } from '../layout.js';

export function ErrorPage(props: {
  status: 400 | 403 | 404 | 500;
  title: string;
  detail?: string;
  backHref?: string;
}) {
  return (
    <Layout title={`${props.status} ${props.title}`} variant="public">
      <main class="mx-auto max-w-md rounded-md border border-gray-200 bg-white p-6 text-center">
        <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">{props.status}</p>
        <h1 class="mt-2 text-xl font-semibold text-gray-900">{props.title}</h1>
        {props.detail && <p class="mt-2 text-sm text-gray-600">{props.detail}</p>}
        <a href={props.backHref ?? '/'} class="mt-6 inline-block text-sm text-blue-700 hover:underline">
          Back
        </a>
      </main>
    </Layout>
  );
}
