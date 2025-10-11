const config: Config = {
  layout: "./layout.kdl",
  environment: async ({ findAvailablePort }) => ({
    // Add your environment variables here
    // Example:
    // API_KEY: "your-api-key",
    // DATABASE_URL: "your-database-url",
    // PORT: await findAvailablePort()
  }),
  setup: async ({ dir, $ }) => {
    // await $`cp -r local ${dir}/local`;
    await $`cd ${dir} && bun install`;
  },
};

module.exports = config;

interface Config {
  layout: string;
  environment: (opts: {
    findAvailablePort: () => Promise<number>;
  }) => Promise<Record<string, string | number>>;
  setup: (opts: { $: Bun.$; dir: string }) => Promise<void>;
}
