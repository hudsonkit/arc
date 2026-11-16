# Arc 0.15.0 release

Prepared locally on 2026-11-16. The version is set in source. Nothing has been published to npm.

## Release scope

Publish `@hudsonkit/arc`, `@hudsonkit/arc-viewer`, `@hudsonkit/arc-iso`, and `@hudsonkit/arc-mcp` at **0.15.0**. The editor workspace keeps its existing version. MCP moves from 0.14.1 to 0.15.0 to rejoin the other packages.

- **Host embedding (#47).** `arc.css` is scoped to Arc's root (`:where(.arc-root)`), so a host page no longer needs a shadow root to contain it. `ARC_ROOT_CLASS` is exported for portal targets.
  - `fitKey` refits a diagram in place, without a remount.
  - `fitMeasure: 'layout'` measures a container inside a scaled ancestor.
  - `@hudsonkit/arc/validate` is a validator entry with no React.
  - Flow `repeat` values are clamped to a whole number or `indefinite`.
- **Push-based diagram command streams (#49).**
  - v1 command envelopes and a pure `applyOps` reducer.
  - `ArcLiveDiagram` and `useArcLive`.
  - A loopback SSE, WebSocket and RPC relay.
  - The CLI commands `serve` and `apply`.
  - The MCP tools `arc_live_serve`, `arc_live_apply` and `arc_live_read`.
  - `LIVE_STREAMS.md` has the wire contract and the Scout integration steps.

## Compatibility

- Inside a host page, Arc now uses its own base font and line height instead of inheriting the host body's. This matches the standalone page.
- `html, body, #root { height: 100% }` is no longer in `arc.css`. Page sizing belongs to the host.
- The live relay is a loopback development reference. It is not an authenticated hosted service.

## Verification

The local checks ran on the release commit: install, typecheck, lint, the full Bun test suite, the library, CLI, MCP and site builds, and `check:dist`. The pull requests #47 and #49 have the per-change results. Browser visual checks were not done.

## Ship procedure

1. A push to `main` starts the GitHub Pages workflow.
2. Run the npm publish workflow with version `0.15.0`, scope `all`, and dry run enabled. Confirm that all four packages pack from the release commit.
3. Publish from the same commit through the workflow, or push tag `v0.15.0` when publication is authorized. The tag starts publication automatically.
4. Verify the registry tarballs, package versions and entrypoints, and the MCP runtime version.

Publish through GitHub Actions to keep npm provenance.
