# Test Plan

## Main menu

### Open/save table file

| Action                                                                            | Expected result                                                                                                                                                |
|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Click on "open file" and select the demo file ./test/demo.dtable                  | Map fits the grid. One 1\*1 player token and one 1\*1 ennemi token. One 2\*2 ennemi token on the GM layer. Fog is enabled and drawn. Player's view fits the map. |
| Start from scratch and make the same table as the previous demo file and save it. | The file is saved and exists on the disk                                                                                                                       |
| Open the previous file.                                                           | The file is loaded.                                                                                                                                            |

## Image Layer

These tests are for every "image layers" : Map, Token and GM.

| Action                                                                    | Expected result                                |
|---------------------------------------------------------------------------|------------------------------------------------|
| Click on the button to add an image.                                      | The image is added to the view.                |
| Click on the image to select it (it is selected by default after import). | The resize handles are displayed.              |
| Move mouse over the image's corners.                                      | The cursor show that the image can be resized. |
| Move mouse over the image.                                                | The cursor show that the image can be moved.   |
| Move the mouse wheel.                                                     | The canvas zooms in and out.                   |

### Map

| Action                                                                            | Expected result                                                            |
|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| Add an image with a grid. Click on the button to automatically rescale the image. | A loading icon is displayed. The image is then rescaled and fits the grid. |

### Token

| Action                            | Expected result                                                                                  |
|-----------------------------------|--------------------------------------------------------------------------------------------------|
| Select a token image and move it. | When released, the token snaps to the grid (center of a cell or at the intersection of 4 cells). |

## Fog Layer

| Action                                                                                      | Expected result                           |
|---------------------------------------------------------------------------------------------|-------------------------------------------|
| Click to enable fog.                                                                        | The fog layer appears.                    |
| Create 2 points by clicking on the screen. Close the drawing by clicking on the last point. | A new polygon is added. Fog is removed.   |
| Draw a second polygon touching the first one.                                               | The two polygons are merged.              |
| Click to disable fog.                                                                       | The fog layer and the drawings disappear. |


| Action | Expected result |
|--------|-----------------|
|        |                 |
