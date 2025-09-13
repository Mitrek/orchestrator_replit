export const config = {
  heatmap: {
    enabled: process.env.HEATMAP_ENABLED === "true",
    deviceDefault: process.env.HEATMAP_DEVICE ?? "desktop",
    returnModeDefault: process.env.HEATMAP_RETURN_MODE ?? "base64"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? null
  }
};
