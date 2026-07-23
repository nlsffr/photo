/**
 * Health check endpoint (used by load balancers / orchestrators).
 * Returns 200 if the service is alive (even if DB is down).
 */

export async function GET() {
  return Response.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
