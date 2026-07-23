/**
 * Readiness check endpoint (used by load balancers to know if this instance can serve traffic).
 * Returns 200 only if all critical dependencies are healthy (DB, Redis, etc).
 *
 * Currently returns 200 since we don't have dependencies yet.
 * When you plug in MariaDB/Redis, check their health here.
 */

export async function GET() {
  // TODO: Check MariaDB, Redis, Elasticsearch connections here
  // Return 503 if any critical dependency is down

  return Response.json(
    { ready: true, timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
