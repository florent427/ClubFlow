# Design System Document

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Athletic Editorial."** 

We are moving away from the "generic SaaS dashboard" look characterized by rigid grids and 1px borders. Instead, we treat the sports association management experience as a premium editorial layout. This system balances the high-stakes authority of a sports league with the fluid, energetic movement of an athlete. 

We achieve this through **Intentional Asymmetry** (e.g., varying card widths in a masonry-style flow), **Ample Breathing Room** (leveraging our spacing scale to let data "respire"), and **Tonal Depth**. The goal is a workspace that feels less like a database and more like a high-end command center.

---

## 2. Colors & Surface Philosophy
Our palette uses deep, authoritative navies contrasted with high-energy accents. However, the execution is where we define our signature.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to define sections, sidebars, or cards. Structure must be achieved through:
- **Background Color Shifts:** Placing a `surface-container-low` card on a `surface` background.
- **Tonal Transitions:** Using the `surface-container` tiers to denote hierarchy.
- **Negative Space:** Using the `8` (2rem) and `10` (2.5rem) spacing tokens to create mental boundaries.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of premium materials.
- **Level 0 (Base):** `surface` (#f8f9fa) — The stadium floor.
- **Level 1 (Sections):** `surface-container-low` (#f3f4f5) — Large content areas.
- **Level 2 (Cards):** `surface-container-lowest` (#ffffff) — The "Active" layer for data entry and primary modules.
- **Level 3 (Popovers/Modals):** `surface-bright` (#f8f9fa) — Floating elements that catch the light.

### The "Glass & Gradient" Rule
To inject "soul" into the dashboard:
- **Primary CTAs:** Use a subtle linear gradient from `primary` (#000666) to `primary_container` (#1a237e) at a 135-degree angle. This adds a "weighted" feel that flat hex codes lack.
- **Floating Navigation:** Use `surface_container_lowest` with an 80% opacity and a `20px` backdrop-blur for a frosted glass effect on top-level navigation bars.

---

## 3. Typography
We utilize **Inter** to maintain a clean, professional sans-serif aesthetic, but we apply it with an editorial hierarchy to drive focus.

*   **Display (Large/Medium):** Reserved for high-level "At a Glance" metrics (e.g., Total Members). Use `display-md` with `on_surface` to anchor the page.
*   **Headlines:** Use `headline-sm` for section titles. These should be paired with `primary` color tokens to subtly reinforce brand authority.
*   **Body:** `body-md` is the workhorse. Ensure a line-height of 1.5 to maintain readability in dense sports statistics.
*   **Labels:** Use `label-md` in `on_surface_variant` (#454652) for metadata. The high contrast between `on_surface` titles and `on_surface_variant` labels creates an immediate visual "map" for the user.

---

## 4. Elevation & Depth
Depth is not a shadow; it is a **layering of light.**

*   **The Layering Principle:** Avoid shadows for static cards. Instead, nest a `surface-container-lowest` card inside a `surface-container` wrapper. The slight shift in grey-scale provides a sophisticated, modern lift.
*   **Ambient Shadows:** For "Active" or "Floating" states (like a dragged calendar event), use an extra-diffused shadow: `box-shadow: 0 12px 32px -4px rgba(25, 28, 29, 0.06)`. Note the use of the `on_surface` color for the shadow tint—never use pure black.
*   **The "Ghost Border" Fallback:** If high-density data requires a container (like a data table), use a `outline-variant` (#c6c5d4) at **15% opacity**. It should be felt, not seen.
*   **Glassmorphism:** Use for "Success" or "Info" toasts. Combine `secondary_container` with a `blur(12px)` to make notifications feel like they are floating above the action.

---

## 5. Components

### Buttons
*   **Primary:** Gradient from `primary` to `primary_container`. Corner radius: `md` (0.75rem). Use `on_primary` text.
*   **Secondary:** Solid `secondary` (#0056c5) with a "Ghost Border" for hover states. 
*   **Tertiary:** No background. Use `on_secondary_fixed_variant` for text. High-energy orange (`on_tertiary_container`) should be used exclusively for "Urgent" actions like "Register Now."

### Cards & Lists
*   **Modular Cards:** Use `xl` (1.5rem) padding. **Forbid divider lines.** Use `1.5` (0.375rem) vertical spacing between list items or shift the background of alternating rows to `surface-container-low`.
*   **Interaction:** On hover, a card should not grow; it should shift from `surface-container-low` to `surface-container-lowest` to simulate "lifting" toward the light.

### Input Fields
*   **Style:** `surface-container-highest` background with a `sm` (0.25rem) bottom-only accent of `outline-variant`.
*   **Focus State:** The bottom accent transitions to `secondary` (#0056c5) with a 2px thickness. No full-box focus rings.

### Relevant App-Specific Components
*   **The "Stat-Wing" Component:** A large display-sm metric paired with a small sparkline chart, housed in a `surface-container-lowest` card with a `lg` (1rem) corner radius.
*   **The "Roster Chip":** A compact `secondary_fixed` background chip with `label-md` text for player status (Active/Inured/Suspended).

---

## 6. Do's and Don'ts

### Do:
*   **Do** use `20` (5rem) spacing at the bottom of pages to ensure the layout "breathes" before the footer/end of content.
*   **Do** use `tertiary` (#331000) and its variants for high-energy sports highlights or urgent alerts.
*   **Do** apply `md` (0.75rem) or `lg` (1rem) corner radius to all containers to soften the "industrial" feel of data management.

### Don't:
*   **Don't** use 100% opaque black for text. Always use `on_surface` (#191c1d) to keep the editorial feel soft.
*   **Don't** use "Drop Shadows" on every card. Reserve elevation for elements that require immediate user interaction.
*   **Don't** use generic icons. Use thick-stroke (2px) custom icons that match the `outline` token weight for a bespoke feel.