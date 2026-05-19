/**
 * Cloudflare Pages Function — /api/tasks
 * Route: functions/api/tasks.js
 * KV Namespace binding: TASKS_STORAGE
 *
 * Keys: tasks_{userId}_{workspace}
 * e.g.: tasks_alex_job, tasks_alex_personal, tasks_giani_job ...
 */

export async function onRequestGet(context) {
  const url  = new URL(context.request.url);
  const ws   = url.searchParams.get('workspace') || 'job';
  const user = url.searchParams.get('user')      || 'default';
  const key  = `tasks_${user}_${ws}`;
  const val  = await context.env.TASKS_STORAGE.get(key);
  return new Response(val || '[]', {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestPost(context) {
  const url  = new URL(context.request.url);
  const ws   = url.searchParams.get('workspace') || 'job';
  const user = url.searchParams.get('user')      || 'default';
  const key  = `tasks_${user}_${ws}`;
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
