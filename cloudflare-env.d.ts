declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    ARTIFACTS: R2Bucket;
    KILN_ORCHESTRATOR_URL?: string;
    KILN_SERVICE_TOKEN?: string;
    KILN_EXECUTOR_SERVICE_TOKEN?: string;
    IMAGES: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: {
            format: string;
            quality: number;
          }): Promise<{ response(): Response }>;
        };
      };
    };
  }
}
