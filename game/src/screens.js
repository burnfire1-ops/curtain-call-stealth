// CURTAIN CALL — M4 screen flow: select -> play -> pause -> win/lose.
// M14: the opener is the job-select screen (the old start screen is
// gone — its rules live in the HOW TO PLAY panel on the select screen).
// game-ui-ux: screens modelled as a tiny state machine, not booleans —
// one function owns every transition, so the flow is unit-testable and
// main.js only interprets its result. Pure, no DOM.
// Returns { screen } or { screen, action } where action is one of:
//   'select'   — pick a job card (main.js updates the selection +
//                the select backdrop world)
//   'startJob' — start the selected job (main.js rebuilds that job's world)
//   'next'     — Job 1 won, ENTER goes straight to Job 2
//   'title'    — Job 2 won, ENTER goes back to the title (select)
//   'restart'  — rebuild the current job's world and play again
// Keys are e.code values from input.js (Enter, KeyR, KeyP, Digit1/2).
// opts: { selected, cleared, jobIndex } — the campaign state main.js owns.
export function transition(screen, key, opts = {}) {
  if (screen === 'select') {
    if (key === 'Digit1') return { screen: 'select', action: 'select', job: 0 };
    if (key === 'Digit2') {
      // Job 2 is locked until Job 1 is cleared — pressing 2 does nothing.
      if (opts.cleared && !opts.cleared[0]) return { screen: 'select' };
      return { screen: 'select', action: 'select', job: 1 };
    }
    if (key === 'Enter') {
      const selected = opts.selected || 0;
      if (selected > 0 && opts.cleared && !opts.cleared[0]) {
        return { screen: 'select' };
      }
      return { screen: 'play', action: 'startJob', job: selected };
    }
    return { screen: 'select' };
  }
  if (screen === 'play') {
    if (key === 'KeyP') return { screen: 'paused' };
    if (key === 'KeyR') return { screen: 'play', action: 'restart' };
    return { screen: 'play' };
  }
  if (screen === 'paused') {
    if (key === 'KeyP') return { screen: 'play' };
    if (key === 'KeyR') return { screen: 'play', action: 'restart' };
    return { screen: 'paused' };
  }
  // 'win' | 'lose': R restarts the same job; P does nothing here.
  // Enter on a Job 1 win goes NEXT JOB; Enter on a Job 2 win goes back
  // to the title; Enter on a loss restarts the job.
  if (key === 'KeyR') {
    return { screen: 'play', action: 'restart' };
  }
  if (key === 'Enter') {
    if (screen === 'win' && (opts.jobIndex || 0) === 0) {
      return { screen: 'play', action: 'next' };
    }
    if (screen === 'win') {
      return { screen: 'select', action: 'title' };
    }
    return { screen: 'play', action: 'restart' };
  }
  return { screen };
}
