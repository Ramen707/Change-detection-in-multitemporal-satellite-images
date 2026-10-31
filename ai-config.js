(() => {
  const localHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  window.GROUNDTRUTH_AI_API_BASE = localHost
    ? "http://localhost:10000"
    : "https://groundtruth-change-detection-ai-api.onrender.com";
})();