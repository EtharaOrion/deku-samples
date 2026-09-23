# Vela design system

## 0. Reference
The primary visual contract is instruction.md, with opalcamera_prd.md as supporting measured evidence. The live Opal reference redirects to op.al, an editorial letter with restrained type over film. Vela keeps its own brand, copy and original product illustrations. No tracking or runtime external assets.

## 1. Direction
A workshop letter, followed by a compact equipment ledger. The memorable moment is the film receding into dark ground as the reader reaches the dot-field wordmark. Commerce is operational, not a second marketing page.

## 2. Tokens
Light ground #fff, light foreground #000; dark ground #000, dark foreground #fff. Readable secondary text is #767676 on light and #818181 on dark. The one accent is #ffdb00 and appears only in the letter closing. Error #c8321a, progress #6f5200 and success #0b6b3a are distinct. One 1px border, 8px control radius, 0px media radius. One elevation 0 2px 4px rgb(0 0 0 / 5%). Spacing is multiples of 4px, gutters 20px.

## 3. Typography
Grotesque normal 400/700 only. System monospace for identifiers only, tabular numerals for money and aligned figures. Root 16/24. Letter display 12vw and body 3.75vw below 64rem; 48.932px and 20.9709px at desktop. Header 80px; footer links 14/21.

## 4. Layout
Editorial is dark, without navigation until the footer. Commerce has a 240px left rail on desktop. At 64rem it becomes a disclosure above the content. Product cards: two cameras, three accessories; one column on mobile. Checkout: form plus persistent summary, stacked on mobile.

## 5. Primitives
Surface, rail, page heading, card, table, field, button, radio option, quantity control, status chip, persistent notice and native disclosure. Buttons have default, focus, hover, disabled-with-reason and pending states. Destructive actions use native confirmation. First focus target is the skip link.

## 6. Motion
150ms linear state transitions. Scroll darkening is proportional and reversible, including reduced motion. Reduced motion removes transitions and film playback. Footer dots respond to pointer position and stop work offscreen.

## 7. Accessibility
Semantic HTML, associated labels, foreground 2px focus ring offset 2px. No colour-only meanings. Polite status announcements. Keyboard-accessible galleries and native disclosures. Long identifiers wrap without horizontal overflow.

## 8. Verification and limitations
The full pass is `harness/verify_all.sh` from the task root: reset, type check, browser walkthrough with frames at three widths, verifier tests, then both supplemental audits. Verify all routes at mobile/tablet/desktop, keyboard operation and real checkout. Hardware transport and downloadable binaries must not be represented as working without actual vendor artifacts and protocol. These assets are not included in the task bundle.
