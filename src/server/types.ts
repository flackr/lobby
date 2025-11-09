import type { Results, QueryOptions } from '@electric-sql/pglite';

// Common interface between official pg PoolClient and PGLite interface used for testing.
export type PGInterface = {
  query<T>(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[],
    options?: QueryOptions
  ): Promise<Results<T>>;
};
