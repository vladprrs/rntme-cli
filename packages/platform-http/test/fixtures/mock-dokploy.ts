import { Hono } from 'hono';

type MockDokployApplication = Record<string, unknown> & {
  applicationId: string;
  name: string;
};

type MockDokployDomain = {
  domainId: string;
  applicationId: string;
  host: string;
};

type MockDokployMount = {
  mountId: string;
  applicationId: string;
  mountPath?: string;
  filePath?: string;
  content?: string;
};

export function createMockDokployApp() {
  const app = new Hono();
  const applications = new Map<string, MockDokployApplication>();
  const domains = new Map<string, MockDokployDomain>();
  const mounts = new Map<string, MockDokployMount>();
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

  app.post('/api/application.saveEnvironment', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const app = findApplication(String(body.applicationId ?? ''));
    if (!app) return c.json({ message: 'Not found' }, 404);
    app.env = body.env;
    return c.json(app);
  });

  app.post('/api/application.saveDockerProvider', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const app = findApplication(String(body.applicationId ?? ''));
    if (!app) return c.json({ message: 'Not found' }, 404);
    app.dockerImage = body.dockerImage;
    return c.json(app);
  });

  app.post('/api/application.saveBuildType', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const app = findApplication(String(body.applicationId ?? ''));
    if (!app) return c.json({ message: 'Not found' }, 404);
    app.build = body;
    return c.json(app);
  });

  app.get('/api/mounts.allNamedByApplicationId', async (c) => {
    const applicationId = c.req.query('applicationId');
    return c.json(Array.from(mounts.values()).filter((mount) => mount.applicationId === applicationId));
  });

  app.post('/api/mounts.create', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const mount = {
      ...body,
      mountId: `mount-${mounts.size + 1}`,
      applicationId: String(body.serviceId ?? body.applicationId ?? ''),
      ...optionalString('mountPath', body.mountPath),
      ...optionalString('filePath', body.filePath),
      ...optionalString('content', body.content),
    };
    mounts.set(mount.mountId, mount);
    return c.json(mount);
  });

  app.post('/api/mounts.update', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const mountId = String(body.mountId ?? '');
    const existing = mounts.get(mountId);
    if (!existing) return c.json({ message: 'Not found' }, 404);
    const mount = {
      ...existing,
      ...body,
      mountId,
      applicationId: String(body.serviceId ?? body.applicationId ?? existing.applicationId),
      ...optionalString('mountPath', body.mountPath ?? existing.mountPath),
      ...optionalString('filePath', body.filePath ?? existing.filePath),
      ...optionalString('content', body.content ?? existing.content),
    };
    mounts.set(mountId, mount);
    return c.json(mount);
  });

  app.get('/api/domain.byApplicationId', async (c) => {
    const applicationId = c.req.query('applicationId');
    return c.json(Array.from(domains.values()).filter((domain) => domain.applicationId === applicationId));
  });

  app.post('/api/domain.create', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const domain = {
      ...body,
      domainId: `domain-${domains.size + 1}`,
      applicationId: String(body.applicationId ?? ''),
      host: String(body.host ?? ''),
    };
    domains.set(domain.domainId, domain);
    return c.json(domain);
  });

  app.post('/api/domain.update', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const domainId = String(body.domainId ?? '');
    const existing = domains.get(domainId);
    if (!existing) return c.json({ message: 'Not found' }, 404);
    const domain = {
      ...existing,
      ...body,
      domainId,
      applicationId: String(body.applicationId ?? existing.applicationId),
      host: String(body.host ?? existing.host),
    };
    domains.set(domainId, domain);
    return c.json(domain);
  });

  app.post('/api/application.deploy', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const app = findApplication(String(body.applicationId ?? ''));
    if (!app) return c.json({ message: 'Not found' }, 404);
    app.lastDeploymentStatus = 'done';
    return c.json({});
  });

  app.post('/api/application.start', async (c) => {
    const body = await c.req.json<Record<string, unknown>>();
    const app = findApplication(String(body.applicationId ?? ''));
    if (!app) return c.json({ message: 'Not found' }, 404);
    app.applicationStatus = 'done';
    return c.json({});
  });

  function findApplication(applicationId: string): MockDokployApplication | undefined {
    return Array.from(applications.values()).find((app) => app.applicationId === applicationId);
  }

  function optionalString(key: string, value: unknown): Record<string, string> {
    return typeof value === 'string' ? { [key]: value } : {};
  }

  return { app, applications };
}
