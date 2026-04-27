import { Hono } from 'hono';

type MockDokployApplication = Record<string, unknown> & {
  applicationId: string;
  name: string;
};

export function createMockDokployApp() {
  const app = new Hono();
  const applications = new Map<string, MockDokployApplication>();
  const projectId = 'mock-project';
  const environmentId = 'mock-env';

  app.get('/api/project.all', async (c) => {
    return c.json([
      {
        projectId,
        name: 'mock-project',
        environments: [
          {
            environmentId,
            name: 'production',
            applications: Array.from(applications.values()).map(a => ({
              applicationId: a.applicationId,
              name: a.name,
              applicationStatus: 'done'
            }))
          }
        ]
      }
    ]);
  });

  app.post('/api/project.create', async (c) => c.json({ projectId, name: 'mock-project' }));
  app.post('/api/environment.create', async (c) => c.json({ environmentId, name: 'production' }));

  app.get('/api/application.one', async (c) => {
    const id = c.req.query('applicationId');
    const app = Array.from(applications.values()).find(a => a.applicationId === id);
    if (!app) return c.json({ message: 'Not found' }, 404);
    return c.json(app);
  });

  app.post('/api/application.create', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const name = typeof body.name === 'string' ? body.name : `app-${applications.size + 1}`;
    const application = { ...body, applicationId: `app-${applications.size + 1}`, name };
    applications.set(application.name, application);
    return c.json(application);
  });

  app.post('/api/application.update', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const existing = Array.from(applications.values()).find((app) => app.applicationId === body.applicationId);
    const applicationId = typeof body.applicationId === 'string' ? body.applicationId : existing?.applicationId ?? `app-${applications.size + 1}`;
    const name = typeof body.name === 'string' ? body.name : existing?.name ?? applicationId;
    const application = { ...existing, ...body, applicationId, name };
    applications.set(application.name, application);
    return c.json(application);
  });

  return { app, applications };
}
