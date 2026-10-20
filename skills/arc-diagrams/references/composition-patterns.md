# Technical illustration patterns

Choose a pattern by the reader's question. These are composition starting points,
not mandatory templates. The examples use hypothetical systems and no performance
claims. Adapt their geometry, labels, and semantic roles together.

| Question | Pattern | Working source |
| --- | --- | --- |
| Where does the request go? | One horizontal spine with a secondary lane | [Request path](../examples/request-path.arc.json) |
| Who owns each part? | Nested or adjacent regions with labeled crossings | [Trust boundary](../examples/trust-boundary.arc.json) |
| What changes when we add a queue? | Aligned before/after panels | [Queue comparison](../examples/queue-comparison.arc.json) |
| What sits above what? | Separated tiers with consistent footprint | [Layered service](../examples/layered-service.iso.json) |
| What are the facets of this idea? | An opening shell with three named faces | [Field recorder](../examples/field-recorder.panel-cube.json) |

## Request path

Put the entry point on the left and the destination on the right. Label arrows
with the action or protocol. Put background work on a lower lane and distinguish
it with a dashed connection. Keep the main route visually continuous. In the
example, the API writes to storage; an independent queue branch explains deferred
work. A guided view can isolate the primary path without removing context.
The example uses explicit 90×60 node dimensions on a compact canvas so its short
labels remain useful when the figure is reduced to a README column.

**Avoid:** placing a cache in the main spine unless every request actually visits
it; drawing a single bidirectional arrow when request and response differ.

## Boundary plate

A region is a claim about ownership, isolation, deployment, or trust. Name that
claim. Give its header space above its contents. Cross its edge through a clear
channel and label what crosses. The example separates a user's device from the
service's private network, with the gateway on the service side.

**Avoid:** using a dashed rectangle as vague decoration or implying that a cloud
provider boundary is automatically a security boundary.

## Comparison

Keep repeated objects in the same columns, use the same scales and colors, and
label both conditions. Highlight only the changed mechanism. The example keeps
Client and API in their columns, then contrasts synchronous work with enqueueing.
Its caption must explain that queueing defers completion; it does not prove that
total work is faster. For larger comparisons use separate figures at the same
scale rather than shrinking two complete architectures into one image.

**Avoid:** green “after” versus red “before” when no measured improvement exists.

## Layered cutaway

Use a shared footprint so tiers read as one system. Offset or separate tiers to
expose the dependency underneath; reserve height for a defined hierarchy. Keep
labels outside occluding faces where necessary. Show only components needed for
the explanation. The example separates runtime, services, and interface.

**Avoid:** floating boxes with no stated relationship, 3D for a simple sequence,
or height that appears quantitative when it is only categorical.

## Detail inset

Start with an overview and select one component. Repeat that component's name,
color, and identifier in a separate expanded view. Use an external caption or
SVG framing for the inset; Arc has no generic “inset” JSON field. The overview
answers where; the detail answers how. Use a leader without an arrowhead when
it means correspondence rather than data flow.

## Opening shell

Use a panel cube when three aspects belong to one concept. Its assembled form
establishes the whole; outward separation reveals each aspect. Give the front
faces short, distinct labels and use their descriptions to carry the explanation.
Graphite gradients, thin edge highlights, and a soft shadow establish the material;
keep the surrounding surface quiet so the callouts remain readable.

The field recorder example names Capture, Storage, and Playback. It is a conceptual
illustration, not a claim that a recorder has three cubic parts. Explain that in
the caption. For a physical assembly with meaningful stacking and containment,
use an exploded assembly instead. See [panel cubes](panel-cubes.md) for the API.

**Avoid:** treating faces as quantities, hiding essential information behind hover,
or adding more labels than the three visible faces can carry.

## Mechanism states

Show two or three meaningful states of a queue, pool, retry, or cache. Fix object
positions; change only state and ownership. Derive counts and highlights from one
model. Use example values explicitly labeled as illustrative. A comparison of
stills is often enough; add controls only when exploring the mechanism benefits
from interaction.

## Finish at the destination size

A full-width technical article can carry more detail than an npm README. Crop
unused space but retain clear channels around labels and a quiet outer margin.
Choose one Arc theme that fits the surrounding surface. A title states the subject;
a caption explains the observation. A legend earns its space only when encodings
cannot be understood from direct labels. Export and inspect before delivery.
