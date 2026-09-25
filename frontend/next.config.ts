import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Unity's production WebGL export is pre-compressed. These headers let the
  // browser decode each asset while preserving the runtime MIME type.
  async headers() {
    return [
      {
        source: "/unity/bharati/Build/WebGL.data.gz",
        headers: [
          { key: "Content-Encoding", value: "gzip" },
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
      {
        source: "/unity/bharati/Build/WebGL.framework.js.gz",
        headers: [
          { key: "Content-Encoding", value: "gzip" },
          { key: "Content-Type", value: "application/javascript" },
        ],
      },
      {
        source: "/unity/bharati/Build/WebGL.wasm.gz",
        headers: [
          { key: "Content-Encoding", value: "gzip" },
          { key: "Content-Type", value: "application/wasm" },
        ],
      },
    ]
  },
};

export default nextConfig;
