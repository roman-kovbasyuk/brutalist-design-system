# SidebarPanel

Canonical workspace shell component, exported through the design-system package.
The UI-block entry remains a compatibility export; product content and state are supplied through props.

- Search expands the header icon into a labelled field and focuses it without scrolling the page.
- Escape clears the query, collapses the field, and returns focus to the icon. Empty search also collapses on blur; a populated query stays visible when users interact with results or menus.
- Search results occupy the same scrolling body as navigation, keeping the account footer anchored.
- Project titles truncate to one line. Action space is reserved to avoid shifting text; actions appear on hover, keyboard focus, or touch devices.
- Account menus open above the footer. The full name remains accessible when its visible label is truncated.
- Motion follows Basics duration/easing tokens and respects reduced motion.
- Width defaults to 262px, constrained by its container; consumers may set `--ds-sidebar-panel-width` and supply a height through their composition styles.
