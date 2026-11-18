# RuleShift labeling page

A static page for an internal annotation round. Annotators screen work-zone photos and answer questions about how temporary traffic controls change the permanent traffic rules.

- Annotators open `https://hhjj233.github.io/ruleshift-label-app/?who=A` (or `?who=B`).
- Answers are kept in the browser. With the token an annotator was given, they are also saved to a separate private repository through the GitHub API. The page sends them nowhere else.
- `guide/` is the annotation guide. `data/` holds the questions and each annotator's photo list. `app.js` is the page.

The page also works when opened from a local copy of this folder.

## Photos

The photos and the boxes drawn on them come from the [ROADWork dataset](https://github.com/anuragxel/roadwork-dataset) (Ghosh et al., [ICCV 2025](https://arxiv.org/abs/2406.07661)), released under the [Open Data Commons Attribution License (ODC-By 1.0)](https://opendatacommons.org/licenses/by/1-0/). The photos here were resized.
