# Tiled Map Generator

A static browser app for generating Tiled maps (`.tmx`) from uploaded spritesheets.

## Start

Open `index.html` directly in a browser.

## Basic Workflow

1. Set the map name, map width, map height, and tile size in pixels, for example 16x16 or 32x32.
2. Upload one or more spritesheets, or drag image files onto the upload drop area.
3. Select a spritesheet from the uploaded sheet list.
4. Mark one or more adjacent grid cells in the spritesheet editor.
5. Choose a pool: `Ground`, `GroundDecoration`, `Buildings`, `Decoration`, or `Interactable`.
6. Click `Assign Selection` to save the marked rectangle as one reusable stamp.
7. Generate layers from the layer generator panel.
8. Remove and regenerate layers until the result looks right.
9. Configure interactable properties, for example `bool smashable = true`.
10. Click `Export TMX` to download the `.tmx` file.

## Selecting Spritesheet Objects

- Single-cell selection creates a one-tile stamp, for example 16x16 when the tile size is 16.
- Dragging over multiple adjacent cells creates one multi-tile stamp, for example 32x16 or 16x32.
- Multi-tile selections must be rectangular.
- Changing the tile size recalculates the spritesheet grid. Existing pools are reset because their old tile indexes no longer match the new grid.
- Assigned stamps are highlighted on the spritesheet.
- `Reset Selection` clears only the current unsaved selection.
- Use the trash button in a pool card to clear that pool and remove its generated layer.

## Zoom

- The spritesheet editor has a zoom slider and a reset zoom button.
- The map preview has its own zoom slider and reset button.
- Both zoom controls display the current zoom percentage.
- Zoom changes only the editor/preview display size. It does not change the exported map or tile size.

## Layer Rules

- `Ground` is generated as a full base layer.
- `GroundDecoration` may overlap other object-like layers.
- `Buildings`, `Decoration`, and `Interactable` block each other.
- Multi-tile stamps reserve their full area during generation.
- Interactables are exported as a Tiled `objectgroup` with the configured properties.

## Export Notes

- The TMX export references uploaded spritesheet filenames in `<image source="...">`.
- Put the image files next to the exported `.tmx` file before opening it in Tiled, or adjust the paths manually.
- Tile layers are exported as CSV data.
- Interactable objects include `gid`, `width`, `height`, and custom properties.
