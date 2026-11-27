// Normalize text for discovery fingerprints only; never modify resource bytes.
export function normalizeRegistrySource(path, content) {
  return /\.(?:ts|tsx|kt|css|html|md|xml|json|svg|js|mjs|webmanifest|csv)$/.test(path)
    ? content.toString("utf8").replaceAll("\r\n", "\n") : content;
}
