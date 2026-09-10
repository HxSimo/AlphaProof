import { Id } from '@poa/schemas';

export async function GET(
  _request: Request,
  context: { params: Promise<{ experimentId: string }> },
) {
  const parsed = Id.safeParse((await context.params).experimentId);
  if (!parsed.success)
    return Response.json({ code: 'INVALID_SCHEMA' }, { status: 400 });
  try {
    const response = await fetch(
      (process.env.API_INTERNAL_URL ?? 'http://localhost:3001') +
        '/v1/experiments/' +
        parsed.data +
        '/demo-export',
      { cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok)
      return Response.json({ code: 'EXPORT_INCOMPLETE' }, { status: 503 });
    return new Response(await response.text(), {
      headers: {
        'content-type': 'application/json',
        'content-disposition':
          'attachment; filename="' + parsed.data + '.json"',
      },
    });
  } catch {
    return Response.json({ code: 'DATA_UNAVAILABLE' }, { status: 503 });
  }
}
