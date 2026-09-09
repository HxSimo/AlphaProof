import Fastify from 'fastify';
import { catalog } from '@poa/config';
import { PoaError } from '@poa/domain';
import {
  ActionEnvelope,
  AgentRegistration,
  AgentVersionRegistration,
  ExperimentCreateRequest,
} from '@poa/schemas';
import type { ExperimentRepository } from '@poa/storage';

export function createServer(
  checkDatabase: () => Promise<void> = async () => {
    throw new Error('Database not configured');
  },
  repository?: ExperimentRepository,
) {
  const config = catalog();
  const app = Fastify({ bodyLimit: 65536, logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PoaError) {
      const status = [
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
  app.get('/health/live', async () => ({ status: 'ok', milestone: 'M4' }));
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
