import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Renders its children straight into <body>, as a sibling of the app's own
// #root — not anywhere inside AppShell's layout tree. That matters because
// AppShell's content area is a height-capped, `overflow-auto` flex column
// (see AppShell.tsx's <main>), and a modal dialog's content is `fixed` and
// height-capped too (see ui/dialog.tsx). Printing content nested inside
// either of those, even after resetting their CSS for print, is unreliable
// — browsers tend to clip a scrollable or fixed ancestor's overflow instead
// of paginating across it. A portal straight to <body> sidesteps all of
// that: the printed content is a plain block in the page's own normal
// flow, with nothing above it constraining its height, so it paginates
// correctly no matter how long it is.
//
// It's invisible on screen (`hidden`) and shown only for print (`print:
// block`, see index.css's @media print block, which also hides everything
// else on the page so this is the only thing that ends up on paper).
export function PrintArea({ children }: { children: ReactNode }) {
  return createPortal(<div className="print-area hidden print:block">{children}</div>, document.body)
}
