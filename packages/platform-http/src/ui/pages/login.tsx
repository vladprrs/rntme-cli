import { Layout } from '../layout.js';

export function LoginPage(props: { flash?: string | undefined } = {}) {
  return (
    <Layout title="Sign in" variant="public" flash={props.flash}>
      <main class="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 class="text-2xl font-semibold tracking-tight">Sign in to rntme</h1>
        <p class="mt-2 max-w-md text-sm text-gray-600">
          Manage your projects, services, and API tokens on the rntme control-plane.
        </p>
        <a
          href="/v1/auth/login"
          class="mt-6 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Sign in
        </a>
      </main>
    </Layout>
  );
}
