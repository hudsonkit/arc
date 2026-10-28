For a README, export a short GIF of one route, keep a static image beside it, and commit the editable diagram source. The animation explains the path; the source gives the next contributor a way to update it.

Arc can export authored architecture flows as SVG, PNG, GIF, or MP4. The format choice depends on where the explanation will appear. A GIF can sit in an image slot in a README. A PNG provides a still view. An MP4 fits a presentation or video player. An SVG preserves vector geometry and can include animated flow routes, subject to the destination's rendering behavior. [Export formats](https://github.com/hudsonkit/arc/blob/main/docs/exports.md)

## Follow one background job

Start with Arc's [background jobs example](https://hudsonkit.com/arc/examples/job-queue). It contains an API, job queue, worker, result store, and dead-letter queue. The successful route runs from the API through the queue and worker to the result store. A separate connection shows where work goes after exhausted retries.

![A successful job moves through the queue and worker](assets/job-queue-article.gif)

Adapted from Arc's [background jobs example](https://hudsonkit.com/arc/examples/job-queue). The marker follows a successful job through the queue and worker to the result store. Repeated descriptions were removed; timing is illustrative.

That distinction matters when you animate the diagram. A moving marker should explain the selected route. Sending it down every connection in succession would suggest that a successful job also ends in the dead-letter queue.

The example's `flows` array selects the successful route. Its legs use node IDs from the downloaded file; `db` is the result store:

```json
{
  "flows": [
    {
      "id": "request",
      "legs": [
        { "from": "api", "to": "q" },
        { "from": "q", "to": "worker" },
        { "from": "worker", "to": "db" }
      ],
      "duration": 7,
      "marker": "packet",
      "color": "blue",
      "trail": "fade"
    }
  ]
}
```

This is the flow section of the complete diagram, not a standalone input file. Each leg refers to nodes and connectors already defined in the downloaded JSON.

The seven-second duration is presentation timing. It does not report queue latency, processing time, or throughput. Say that in the caption if a reader could interpret the motion as performance data.

## Render the files

Use Node.js 22 or later. Install Arc in the project where you will maintain the diagram:

```bash
npm install --save-dev @hudsonkit/arc@0.14.0
```

Download the example's `.json` file and save it as `job-queue.json`. Then validate it:

```bash
npx arc check job-queue.json
```

Resolve any error diagnostics before rendering. A valid configuration confirms that Arc can interpret the document; it does not confirm that the document describes your production system.

PNG rendering requires Chrome or Chromium. GIF and MP4 rendering also require ffmpeg. If Arc cannot find those executables, set `ARC_CHROME` and `ARC_FFMPEG` to their executable paths.

Export the README animation:

```bash
npx arc render job-queue.json --out job-queue.gif --duration 7 --fps 12
```

The seven-second capture covers the example's authored flow. A shorter capture would show only part of its route. Start at twelve frames per second. Then check movement, text, and file size at the README's display width.

Export a still at a chosen instant:

```bash
npx arc render job-queue.json --out job-queue.png --flow-time 3.5
```

The `--flow-time` value selects the point in the authored animation to capture. Use the still when motion is unnecessary or distracting. Export vector and video versions when you need them:

```bash
npx arc render job-queue.json --out job-queue.svg
npx arc render job-queue.json --out job-queue.mp4 --duration 7 --fps 30
```

SVG and PNG do not use `--duration` or `--fps`. GIF and MP4 are rendered clips; they do not preserve an interactive viewer's controls.

## Embed the GIF and link to the still and source

Put the diagram source and chosen exports in a directory such as `docs/diagrams/`. From a README at the repository root, embed the GIF and link to the still and source:

```markdown
![A job moves from the API to the queue, worker, and result store.](docs/diagrams/job-queue.gif)

The animation follows a successful job. Exhausted retries take the
separate dead-letter path. Timing is illustrative.

[Static diagram](docs/diagrams/job-queue.png) ·
[Editable source](docs/diagrams/job-queue.json)
```

Preview the README on its intended host. Check the image at the width readers will see, rather than judging only a large local export. The component names and connector labels must remain readable. The still should explain the same structure without requiring the reader to watch the loop.

Keep the caption focused on what the motion means. “System architecture” is less useful than identifying the successful route and the separate failure path. Alt text and nearby prose also give readers the essential explanation when the animation is unavailable.

## Preserve the meaning when the system changes

When you change the route, edit the JSON first and regenerate the exports. Review the source diff alongside the rendered result. Moving a worker, adding a retry connection, and adding that connection to the animated route are different changes. A reviewer should be able to see which one occurred.

The exporter renders architecture `flows` from `ArcDiagramData`. Native Mermaid sequences use a separate player and timeline; the same CLI commands do not turn a Mermaid sequence into a GIF. Use the [native sequence player](https://github.com/hudsonkit/arc/blob/main/docs/mermaid-sequences.md) when the reader needs ordered messages and branch fragments in an interactive page.

For the README, begin with [the background jobs source](https://hudsonkit.com/arc/examples/job-queue), replace its labels and route with your system's behavior, and export one successful path. Add a second explanation only when it answers a second question, such as where a failed job waits for investigation.
