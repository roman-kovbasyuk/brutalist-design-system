# Architecture

The package has four boundaries:

- `src/components/design-system/foundations` contains values with no task behavior.
- `src/components/design-system/atoms` contains one control or visual responsibility.
- `src/components/design-system/molecules` contains a coordinated interaction built from native controls and atoms.
- `src/components/design-system/organisms` contains a complete reusable task surface without product requests, authentication, or domain state.

`catalog/` is an independent consumer. It imports the public entry point exactly as another application does. Components own their interaction behavior and local styles; consuming applications own composition, data, permissions, and persistence.
