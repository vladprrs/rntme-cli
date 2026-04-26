import { Hono } from 'hono';
import type { DokployApplication } from '@rntme-cli/deploy-dokploy';

export function createMockDokployApp() {
  const app = new Hono();
  const applications = new Map<string, DokployApplication>();
  const projectId = 'mock-project';

  app.post('/api/v1/projects/ensure', async (c) => c.json({ projectId }));

  app.post('/api/v1/applications/find', async (c) => {
    const body = await c.req.json<{ name: string }>();
    return c.json({ application: applications.get(body.name) ?? null });
  });

  app.post('/api/v1/applications/create', async (c) => {
    const body = await c.req.json<{ resource: DokployApplication }>();
    const application = { ...body.resource, id: `app-${applications.size + 1}` };
    applications.set(application.name, application);
    return c.json({ application });
  });

  app.post('/api/v1/applications/update', async (c) => {
    const body = await c.req.json<{ applicationId: string; resource: DokployApplication }>();
    const existing = [...applications.values()].find((app) => app.id === body.applicationId);
    const application = { ...body.resource, id: body.applicationId, name: body.resource.name ?? existing?.name ?? body.applicationId };
    applications.set(application.name, application);
    return c.json({ application });
  });

  return { app, applications };
}
