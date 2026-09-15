import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({ js: format === "esm" ? ".mjs" : ".cjs" }),
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "node",
  // node-tls-client 는 네이티브 바이너리를 내려받는 런타임 의존이라 번들에 넣지 않습니다.
  external: ["node-tls-client"],
});
