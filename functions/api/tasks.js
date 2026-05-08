export async function onRequestGet(context) {
  const url   = new URL(context.request.url);
  const ws    = url.searchParams.get('workspace') || 'job';
  const key   = ws === 'personal' ? 'tasks_personal' : 'tasks_job';
  const value = await context.env.TASKS_STORAGE.get(key);
  return new Response(value || '[]', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestPost(context) {
  const url  = new URL(context.request.url);
  const ws   = url.searchParams.get('workspace') || 'job';
  const key  = ws === 'personal' ? 'tasks_personal' : 'tasks_job';
  const body = await context.request.text();
  try { JSON.parse(body); } catch(e) {
    return new Response('Invalid JSON', { status: 400 });
  }
  await context.env.TASKS_STORAGE.put(key, body);
  return new Response('OK', {
    status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
