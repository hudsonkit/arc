# Arc 0.14.0 release candidate

Prepared locally on 2026-10-20. Nothing has been committed, pushed, published, or deployed by this review.

## Release scope

Publish `@hudsonkit/arc`, `@hudsonkit/arc-viewer`, `@hudsonkit/arc-iso`, and `@hudsonkit/arc-mcp` at **0.14.0**. The editor workspace keeps its existing version.

- Add typed exploded assemblies, shared React and standalone SVG rendering, and a keyboard-first showcase with an AI stack example.
- Add panel cube documents, SVG rendering, and an interactive field recorder with rotation, unfolding, keyboard, and touch controls.
- Update Arc artwork, documentation, and the bundled diagram-authoring skill.
- Preserve connector labels in image exports.

## Review fixes

- Clamp animation time at both ends. An animation frame timestamp can precede the start time and otherwise produce invalid exploded progress during assembly.
- Provide actual CommonJS entrypoints and matching declarations. The previous UMD targets crashed when loaded through `require`. The main package also eagerly loaded an optional terminal dependency. The isometric slim entrypoint now has its own matching declarations. Verify the packed packages with `scripts/check-package-runtime.mjs`.
- Set all release versions before building MCP. Its bundled server metadata previously retained the old version.
- Limit ESLint to maintained source rather than generated bundles and vendored documentation. Fix the panel keyboard activation lint error.
- Generate share metadata for both new showcase routes.

## Verification

The accompanying `arc-release-0.14.0` folder contains package tarballs, checksums, browser captures, logs, and a source snapshot. See `verification.json` for the final local results.

The review covers the full Bun test suite, typecheck, lint, production builds, package contents, ESM and CommonJS imports from packed packages, MCP initialization, and browser interactions for the landing page, examples, exploded assemblies, and panel cube. ESLint has 47 advisory warnings and no errors. GitHub Actions has not run for this candidate. Local checks used Node 26.12.0 and Bun 1.4.0; a separate frozen install passed with the CI-pinned Bun 1.3.11. The workflows use Node 24. Viewer and isometric package checks report advisory package-metadata suggestions.

The site resolves the displayed install version from npm. It will continue to show the published version until npm has the new release.

## Compatibility

Import the main library through `@hudsonkit/arc`. Its CommonJS target is now `lib/arc.cjs`; the former unexported `lib/arc.umd.js` file is no longer emitted. The isometric browser UMD bundles remain available.

## Ship procedure

1. Review the complete working tree, including the new source, tests, skill references, artwork, and release tooling. This candidate includes changes that were already present when the review began.
2. Commit the reviewed release slice. Rebuild and repack if any source changes after verification.
3. Push the reviewed commit when site deployment is authorized. A push to `main` starts the GitHub Pages workflow.
4. Run the npm publish workflow with version `0.14.0`, scope `all`, and dry run enabled. Confirm that all four packages pack successfully from that commit.
5. Publish from the same commit using the workflow, or push tag `v0.14.0` when publication is authorized. The tag starts publication automatically.
6. Verify registry tarball downloads, package versions and entrypoints, MCP runtime version, and the live showcase interactions. Local builds and workflow success do not establish production acceptance.

The local tarballs are review artifacts. Publication should use GitHub Actions to preserve npm provenance.
