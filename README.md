# Play the Suryavanshi

**[Walk out to bat →](https://sidlabs-platform.github.io/play-the-suryavanshi/)** You are Vaibhav Suryavanshi, a left-hander under floodlights, facing a fictional one-over arcade. Kite bowls seam, Comet bowls pace, Orbit bowls spin. Watch the ball, pick your shot and swing as it reaches the gold strip. Can you send all six balls into the stands?

## How to play

| Do this | Get this |
| --- | --- |
| **←** / **A** · **↑** / **W** · **→** / **D** | Off side, straight, leg side. He bats left-handed, so off is the left of your screen. |
| **Space** (or the big button) | Walk out to bat, then a straight swing. |
| Tap the left, middle or right third of the stadium | The same three shots, for phones. |
| **T** / **M** | Pitch guide on or off / sound on or off. |

The key picks the direction; your timing picks the runs. Gold is six, green is four, the edges of the strip are a quick single, and anything outside is a dot ball. The fifth ball is on the stumps: leave it and you’re bowled.

The stadium is procedural, stylised WebGL 2: no downloaded models, textures or audio, and no photoreal broadcast claims. `?q=low` renders at lower resolution, and the game also adapts by itself on slow GPUs. If a browser can’t draw WebGL 2, or you add `?gl=off`, you get **lite mode**: same rules, same timing, scoreboard only.

Static HTML, CSS and JavaScript. No accounts, external assets, API or shared leaderboard. The score is for this innings on this device. Fictional fan project; no endorsement or affiliation.

## Run offline for the conference

With Node 22+ installed: `npm start`, then open `http://127.0.0.1:3000/play-the-suryavanshi/`. No installation or network needed to play locally. GitHub Pages is the audience version; localhost is the presenter fallback.

## Two parts of trust

**Before the agent writes the patch:** give it a bounded ticket, the existing player contract and a clean branch. Locally, `git config --local core.hooksPath .githooks` installs an early scope-and-test check for commits. For a merge commit it checks what your branch changes relative to the commit being merged in, so syncing with `main` is not blocked by files `main` changed. Cloud setup requests the same hook. This is feedback, not a permission boundary: local hooks can be skipped. PR code runs in CI with a read-only contents token, no deployment credentials, and no Pages publish job. Don’t give a coding agent a personal admin token.

**After the agent writes the patch:** `Player contract` plays real overs in Chromium, which draws the 3D stadium in software on the runner: a desktop and a phone (touch taps, reduced motion), in the stadium and in lite mode. It checks the scoreboard, a six on every ball, the bowled ball, the final card and that every button can really be reached. A separate base-branch workflow, `policy/feature-scope`, checks both sides of renames without checking out or executing the PR and posts a status on its head SHA. A feature PR may only change the game and feature tests; a policy change is separate owner-reviewed work. These signals are not mandatory just because their workflows exist. Set the merge rules below before demonstrating enforcement.

```sh
npm ci --ignore-scripts
npm test
npx --no-install playwright-core install chromium
npm run test:browser
```

### Owner setup: native quality and the merge decision

1. **Settings → Code quality → Enable code quality** for JavaScript. Check organization access and billing before confirming. Wait for initial analysis, then refresh/re-run analysis for the PR under review. Do not substitute a lint job labelled “GitHub Code Quality.”
2. In **Settings → Rules → Rulesets**, create an **Active** branch ruleset targeting **the default branch (`main`)**. Add **Require code quality results → Errors** (or Warnings for a stricter gate). This is the native quality threshold, not a guessed status name. The inherited `release/*` rule alone does not cover `main`.
3. Require PRs, ≥1 **independent** approval, dismiss stale approvals, resolve conversations, protect owner-controlled files, and require status checks **Player contract** and **policy/feature-scope** from GitHub Actions once observed. Keep the bypass list empty for the demo. If using CodeQL security scanning, add the separate code-scanning results rule after verifying JavaScript analysis. A successful scanner run is not the same as meeting a findings threshold.
4. Verify on the actual PR and SHA: open each check, inspect the native quality findings, review the diff and demonstrate a legal shot. No independent reviewer, missing expected analysis, or new commit after review? **Hold.** The person who pushed the local PR cannot count their own approval.
5. For a future controlled merge, an authorized owner may enable repository auto-merge, then opt a particular PR in. Copilot **Watch and fix / Agent Merge** can remediate selected blockers; GitHub **auto-merge** performs the merge after rules are satisfied. Neither grants an approval or a bypass. Leave both conference PRs unmerged for discussion.

Sources: [Enable GitHub Code Quality](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/enable-code-quality) · [Set PR quality thresholds](https://docs.github.com/en/code-security/how-tos/maintain-quality-code/set-pr-thresholds) · [Agent Merge vs. auto-merge](https://docs.github.com/copilot/how-tos/copilot-on-github/use-copilot-agents/get-pull-requests-ready-to-merge).
