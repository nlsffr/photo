type DatabasePoolEnvironment = {
  DB_POOL_SIZE?: string;
};

function poolSize(value: string | undefined): number {
  const configured = Number(value ?? 10);
  if (!Number.isFinite(configured) || configured < 1) return 10;
  return Math.min(Math.trunc(configured), 32);
}

export function databasePoolPolicy(env: DatabasePoolEnvironment) {
  const connectionLimit = poolSize(env.DB_POOL_SIZE);

  return {
    connectionLimit,
    waitForConnections: true,
    namedPlaceholders: true,
    maxIdle: Math.min(connectionLimit, 4),
    idleTimeout: 30_000,
    enableKeepAlive: false,
    // mysql2 otherwise destroys idle sockets without COM_QUIT. MariaDB records
    // every normal pool eviction as an aborted client and floods its error log.
    // Source: https://github.com/sidorares/node-mysql2/blob/v3.23.1/lib/base/pool.js#L307-L318
    gracefulEnd: true,
  } as const;
}
