export default {
  layout: "./layout.kdl",
  environment: async ({ findAvailablePort }) => ({
    // Add your environment variables here
    // Example:
    // API_KEY: "your-api-key",
    // DATABASE_URL: "your-database-url",
    // PORT: await findAvailablePort()
  }),
};
