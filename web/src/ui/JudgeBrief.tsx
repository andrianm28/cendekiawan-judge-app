/**
 * The judges' one-page brief and the 80-second video brief, folded away under the team
 * list so a judge can look again before the first team. Both are plain files under
 * /juri/, which the service worker leaves alone, so the video streams normally.
 */
export function JudgeBrief() {
  return (
    <details className="judge-brief">
      <summary>Judge brief: one-page PDF and 80-second video</summary>
      <video src="/juri/judge-video-brief.mp4" controls playsInline preload="none" />
      <a className="link-btn" href="/juri/judge-brief.pdf" target="_blank" rel="noopener">Open the one-page brief (PDF)</a>
    </details>
  )
}
