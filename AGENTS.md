<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Daily control measurements use field-owned writes: PM records actual offered grams and AM updates only remaining grams, so morning saves cannot replace the evening measurement with trial settings.
- Replicate controls live separately from legacy moisture controls to preserve the published single-control workflow and all historical data.
- Retention and intake policies are centralized in metrics.ts with a prospective date boundary; row intake and signed aggregate intake are separate outputs so display clipping never alters totals.
