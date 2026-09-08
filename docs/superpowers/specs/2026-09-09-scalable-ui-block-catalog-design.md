# Scalable UI Block Catalog

The UI blocks catalog uses a data-driven registry of existing block previews. Each entry declares a stable id, group, display name, and render function. The page derives group sections and sidebar items from that registry, sorting groups and items alphabetically. Groups render responsive grids with consistent padding and gaps, while cards show only the block name and live preview. Adding a future block requires a registry entry and no page-layout rewrite.
