// Automated tests are deterministic and never spend real provider credits.
process.env.DEEPSEEK_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.MODEL_PROVIDER = "deepseek";
process.env.AI_HTTPS_PROXY = "";
process.env.HTTPS_PROXY = "";
process.env.HTTP_PROXY = "";
