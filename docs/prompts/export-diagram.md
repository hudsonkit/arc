# Export Diagram

## Prompt Template

```
Export this Arc diagram as [FORMAT]:

[PASTE DIAGRAM CONFIG OR DESCRIBE EXISTING FILE]

Format: [JSON | TypeScript | SVG description | PNG description]
```

## TypeScript Export

```
Export this diagram as a TypeScript file with proper typing:

{ ... diagram config ... }
```

Expected output:
```typescript
import type { ArcDiagramData } from '@hudsonkit/arc'

export const myDiagram: ArcDiagramData = {
  // ... typed config
}
```

## Integration Export

```
Generate the code to render this Arc diagram in a [React|Next.js|Vanilla JS] project:

{ ... diagram config ... }
```

Expected output: Complete component with imports and rendering code.
