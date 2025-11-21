# Test Plan

## Main menu

### Open table file

| Action                                                                            | Expected result                                                                                                                                                |
|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Click on "open file" and select the demo file ./test/demo.dtable                  | Map fits the grid. One 1\*1 player token and one 1\*1 ennemi token. One 2\*2 ennemi token on the GM layer. Fog is enabled and drawn. Player's view fits the map. |
| Start from scratch and make the same table as the previous demo file and save it. | The file is saved and exists on the disk                                                                                                                       |
| Open the previous file.                                                           | The file is loaded.                                                                                                                                            |


