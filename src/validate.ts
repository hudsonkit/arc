/**
 * Arc diagram validation without React or the DOM.
 *
 * `@hudsonkit/arc/validate` lets a Node or Bun runtime check a diagram before
 * it is shown: `validateDiagramShape` answers "is this a diagram?" with one
 * sentence, and `validateDiagram` lists coded, repairable diagnostics.
 *
 * Keep this entry's import graph free of React, react-dom and browser globals.
 * `scripts/validateEntry.test.ts` checks the source graph, and
 * `scripts/check-package-runtime.mjs` imports the packed build without React.
 *
 * @package @hudsonkit/arc/validate
 */
export { validateDiagramShape, isDiagramShape } from './utils/diagramValidation'
export { validateDiagram, type Diagnostic, type DiagnosticSeverity, type DiagnosticSubject, type Fix } from './utils/diagramDiagnostics'
