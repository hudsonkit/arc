# Arc 0.15.1 release

Prepared on 2026-11-17. The version is set in source.

## Release scope

Publish `@hudsonkit/arc`, `@hudsonkit/arc-viewer`, `@hudsonkit/arc-iso`, and `@hudsonkit/arc-mcp` at **0.15.1**. The editor workspace keeps its existing version.

This is a documentation release. The library, viewer, isometric and MCP code is unchanged from 0.15.0.

- **npm READMEs (#55).**
  - `@hudsonkit/arc-iso` has a README for the first time, with an example image, the YAML format, both renderers, the config and the `/slim` entry.
  - The `@hudsonkit/arc-viewer` README lists every `ArcDiagram` prop, shows auto-layout, and no longer links to the unpublished `arc-editor` package.
  - Relative links in every package README are absolute, so they work on npm.
  - The `arc-iso` and `arc-viewer` homepages point to https://hudsonkit.com/arc.
- **Saved review wording (#53).** The MCP README, agent docs and skill no longer call the live and saved review tools a private preview. `docs/private-preview.md` is now `docs/saved-reviews.md`.

## Known issues

These are documented in the `arc-iso` README and are not fixed in 0.15.1.

- `arc-iso` lists React as an optional peer, but every entry point imports it. Install `react` and `react-dom`.
- `parseYamlConfig` does not resolve `*alias` color references in node lines. Write the key without `*`.
- `renderToString` and `renderToElement` ignore `style` and do not draw `pillars`.

## Verification

The local checks ran on the release commit: typecheck, lint, the full Bun test suite, and the release version tests.

## Ship procedure

Publish through GitHub Actions to keep npm provenance.

1. Run the npm publish workflow with version `0.15.1`, scope `all`, and dry run on. Expected result: all four packages pack from the release commit.
2. Push the tag `v0.15.1` on the same commit. The tag starts the npm publish workflow.
3. Verify the registry versions, the READMEs on npm, the entrypoints, and the MCP runtime version.
4. Redeploy arc.jdi.sh (GitHub Pages) and hudsonkit.com/arc (the `hudsonkit-arc` worker). Both read the Arc version from npm when they build.
