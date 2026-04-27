/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';

export function createMockDokployApp() {
  const app = new Hono();
  const applications = new Map<string, any>();
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
    const body = await c.req.json<any>();
    const application = { ...body, applicationId: `app-${applications.size + 1}` };
    applications.set(application.name, application);
    return c.json(application);
  });

  app.post('/api/application.update', async (c) => {
    const body = await c.req.json<any>();
    const existing = Array.from(applications.values()).find((app) => app.applicationId === body.applicationId);
    const application = { ...existing, ...body, applicationId: body.applicationId, name: body.name ?? existing?.name ?? body.applicationId };
    applications.set(application.name, application);
    return c.json(application);
  });

  return { app, applications };
}
