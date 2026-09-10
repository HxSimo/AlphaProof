import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { catalog } from '@poa/config';
import { PoaError, contentHash } from '@poa/domain';
import {
  IncidentInput,
  ActionEnvelope,
  AgentRegistration,
  AgentVersionRegistration,
  ExperimentCreateRequest,
} from '@poa/schemas';
import type {
  ExperimentRepository,
  M6Repository,
  OperationsRepository,
} from '@poa/storage';

export function createServer(
  checkDatabase: () => Promise<void> = async () => {
    throw new Error('Database not configured');
  },
  repository?: ExperimentRepository,
  m6Repository?: M6Repository,
  options: {
    operations?: OperationsRepository;
    controlToken?: string;
    requireControlAuth?: boolean;
  } = {},
) {
  const config = catalog();
  const app = Fastify({ bodyLimit: 65536, logger: false, trustProxy: false });
  app.addHook('onRequest', async (request, reply) => {
    if (options.operations && !request.url.startsWith('/health/')) {
      const allowed = await options.operations.consumeRequest(
        contentHash({ ip: request.ip }),
      );
      if (!allowed)
        return reply
          .code(429)
          .header(
            'retry-after',
            String(options.operations.policy.requestWindowSeconds),
          )
          .send({
            code: 'RATE_LIMITED',
            message: 'Request quota reached; retry after the current window',
          });
    }
    const control =
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      !/^\/v1\/experiments\/[^/]+\/actions$/.test(request.url);
    if (control && options.requireControlAuth) {
      const expected = options.controlToken;
      const supplied = request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : '';
      if (
        !expected ||
        expected.length < 32 ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        throw new PoaError(
          'AUTH_REQUIRED',
          'Operator authorization is required for registry and lifecycle changes',
        );
    }
  });
  if (options.operations) {
    app.get('/health/operations', async () => options.operations!.snapshot());
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/demo-export',
      async (request) =>
        options.operations!.demoSession(request.params.experimentId),
    );
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/incidents',
      async (request) =>
        options.operations!.incidents(request.params.experimentId),
    );
    app.post('/v1/incidents', async (request) =>
      options.operations!.recordIncident(IncidentInput.parse(request.body)),
    );
    app.post<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/stop',
      async (request) => {
        const body = request.body as { reason?: unknown };
        if (typeof body?.reason !== 'string')
          throw new PoaError('INVALID_SCHEMA', 'Stop reason is required');
        return options.operations!.stopExperiment(
          request.params.experimentId,
          body.reason,
        );
      },
    );
  }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PoaError) {
      const status =
        error.code === 'AUTH_REQUIRED'
          ? 401
          : error.code === 'QUOTA_EXCEEDED'
            ? 429
            : [
                  'AGENT_NOT_FOUND',
                  'AGENT_VERSION_NOT_FOUND',
                  'EXPERIMENT_NOT_FOUND',
                ].includes(error.code)
              ? 404
              : [
                    'SCENARIO_BUSY',
                    'STALE_PORTFOLIO',
                    'NONCE_USED',
                    'IDEMPOTENCY_CONFLICT',
                    'EXPERIMENT_LOCKED',
                  ].includes(error.code)
                ? 409
                : 422;
      return reply
        .code(status)
        .send({ code: error.code, message: error.message });
    }
    if ((error as { name?: string }).name === 'ZodError')
      return reply.code(400).send({
        code: 'INVALID_SCHEMA',
        message: 'Request does not match the canonical schema',
      });
    if ((error as { statusCode?: number }).statusCode === 400)
      return reply
        .code(400)
        .send({ code: 'INVALID_SCHEMA', message: 'Malformed request body' });
    if ((error as { statusCode?: number }).statusCode === 413)
      return reply.code(413).send({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request exceeds 65536 bytes',
      });
    if ((error as { code?: string }).code === '23505')
      return reply.code(409).send({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Canonical identifier already exists',
      });
    return reply.code(500).send({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Request could not be completed',
    });
  });
  app.get('/health/live', async () => ({ status: 'ok', milestone: 'M7' }));
  app.get('/health/ready', async (_, reply) => {
    try {
      await checkDatabase();
      return { status: 'ready', bundleHash: config.bundleHash };
    } catch {
      return reply
        .code(503)
        .send({ status: 'unavailable', code: 'DATABASE_UNAVAILABLE' });
    }
  });
  app.get('/v1/profiles', async () => config);
  if (m6Repository) {
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/eligibility',
      async (request) =>
        m6Repository.getEligibility(request.params.experimentId),
    );
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/audit-events',
      async (request) => m6Repository.auditEvents(request.params.experimentId),
    );
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/commitments',
      async (request) => m6Repository.getBatches(request.params.experimentId),
    );
    app.get<{ Params: { batchId: string; leafHash: string } }>(
      '/v1/commitments/:batchId/proofs/:leafHash',
      async (request) =>
        m6Repository.getProof(request.params.batchId, request.params.leafHash),
    );
    app.get<{ Params: { exportId: string } }>(
      '/v1/exports/:exportId',
      async (request) => m6Repository.getExport(request.params.exportId),
    );
    app.get<{ Params: { experimentId: string } }>(
      '/v1/experiments/:experimentId/dashboard',
      async (request) => m6Repository.dashboard(request.params.experimentId),
    );
  }
  if (!repository) return app;
  app.post('/v1/agents', async (request, reply) =>
    reply
      .code(201)
      .send(
        await repository.createAgent(AgentRegistration.parse(request.body)),
      ),
  );
  app.post<{ Params: { agentId: string } }>(
    '/v1/agents/:agentId/versions',
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await repository.createAgentVersion(
            request.params.agentId,
            AgentVersionRegistration.parse(request.body),
          ),
        ),
  );
  app.post<{ Params: { agentId: string; versionId: string } }>(
    '/v1/agents/:agentId/versions/:versionId/revoke',
    async (request) => {
      const body = request.body as { reason?: unknown };
      if (typeof body?.reason !== 'string' || !body.reason)
        throw new PoaError('INVALID_SCHEMA', 'Revocation reason is required');
      return repository.revokeAgentVersion(
        request.params.versionId,
        body.reason,
      );
    },
  );
  app.post('/v1/experiments', async (request, reply) =>
    reply
      .code(201)
      .send(
        await repository.createExperiment(
          ExperimentCreateRequest.parse(request.body),
        ),
      ),
  );
  app.post<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/start',
    async (request) => repository.startExperiment(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/policy',
    async (request) => repository.getPolicy(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/references',
    async (request) => repository.getReferences(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/valuations',
    async (request) => repository.getValuations(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/evaluations',
    async (request) => repository.getEvaluations(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/instruments',
    async (request) => repository.getInstruments(request.params.experimentId),
  );
  app.get<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/portfolios',
    async (request) => repository.getPortfolios(request.params.experimentId),
  );
  app.post<{ Params: { experimentId: string } }>(
    '/v1/experiments/:experimentId/actions',
    async (request, reply) =>
      reply
        .code(202)
        .send(
          await repository.acceptAction(
            request.params.experimentId,
            ActionEnvelope.parse(request.body),
          ),
        ),
  );
  app.get<{ Params: { experimentId: string; actionId: string } }>(
    '/v1/experiments/:experimentId/actions/:actionId',
    async (request) =>
      repository.getAction(
        request.params.experimentId,
        request.params.actionId,
      ),
  );
  return app;
}
