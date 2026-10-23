# CyPat Scoreboard

## Electron desktop app

Run `npm install` once, then `npm start`. Build a macOS app with `npm run pack` or an installer with `npm run dist`. Build Windows/Linux installers on their respective platforms. The desktop version includes its own Node backend; Python and curl are unnecessary. Settings persist in Electron browser storage and observations in `observations.json` under Electron’s userData directory. Desktop observations start fresh and do not import the Python SQLite history. The app uses a dedicated localhost port (47831), verifies upstream HTTPS through Electron networking, and stops its backend on quit. Development builds are unsigned.

Run `npm test` for backend integration checks.

## Optional browser version

Run `python3 server.py`, then open http://localhost:8000. Python 3.10+; no packages required. Configure team IDs, aliases, visible columns, time formats, and arithmetic columns in Configure. Settings persist in the browser; observations persist in history.sqlite3. Keep the page open to poll at the configured interval (60 seconds by default, adjustable from 15 to 3600 seconds in Configure). Stop the server with Ctrl+C.

## Verified public data

Inspected October 22, 2026:
- https://scoreboard.uscyberpatriot.org/ loads rows dynamically from `/api/team/scores.php`. The empty HTML table does **not** mean no live teams exist.
- Team rows supply team_number, images, play_time, score_time, ccs_score, location, division, tier and warning code. Team names and adjustments are not consistently supplied. Aliases are local. Overall denotes the source ordering, not an independently verified official rank.
- `/api/image/scores.php?team=19-0512` supplies current image scores and compact image statistics.
- `/api/image/chart.php?team=19-0512` supplies per-image history in Google DataTable JSON. Verified real points and string `null` gaps. Gaps remain gaps; timestamps default to UTC. Configure → “Show timestamps in my current time zone” converts graph labels, tooltips, and sample timestamps in team statistics using the device’s time zone and daylight saving rules. Play time remains an elapsed duration. The feed omits the year, so conversion uses the nearest valid date to the score fetch, including adjacent years at New Year.
- Total CCS history is observed locally during successful browser polling and stored in SQLite. No invented retrospective totals or interpolated image scores. Polling stops when no browser is open. The source does not explicitly identify the round in the aggregate response; the app says “Current scoreboard” rather than inventing a round number. Clear/archive history.sqlite3 between rounds to avoid mixing observations.

Scores are public provisional values and may exclude penalties. Warning codes are M (multiple instances), S (clock skew), T (time exceeded), U (multiple UIDs); they are not numerical penalties. Network failures retain visible prior data and display an error. The Python backend avoids browser cross-origin restrictions, caches upstream responses for 60 seconds and binds only to localhost.

## Design

Inspected Figma file nirbetuSE7aIzSZlSB4cIl, Main frame 1:9 via connector. Preserved #131517 background, #1a1c20 panels, #313336 borders, 34px rows, alternating fills, 16px spacing, blue Configure button, expanding team-name column, and bottom graph/stat split. The source graph and statistics areas were placeholders. Fonts load from Google Fonts with system fallbacks. Chevron is the original downloaded Figma SVG.

## Limitations

Public endpoints are undocumented and can change. No round identifier is available from the inspected team-score response. The application has no authentication or cloud hosting. Historical storage has no automatic retention policy. Formula expressions support numeric fields and earlier calculated columns, arithmetic and parentheses; division by zero displays an em dash.

Refresh requests start early by the duration of the previous score fetch, targeting completion at the selected interval. Lead time is capped at 80% of the interval, requests never overlap, and missed intervals are skipped. Scheduled score requests bypass the backend cache. Network variability can still delay completion.

Active/inactive image status follows the public Active Teams view (`/api/team/scores.php?recent=5`), which lists teams reporting within the last five minutes. Active teams’ elapsed play time ticks between refreshes, including duration-based calculated columns; official score refreshes replace the estimate. Activity becomes Unknown if the activity request fails or is five minutes stale, and estimates freeze when stale. Image counts and scores are never extrapolated.

Selected active teams refresh both image history and image statistics with a fresh request on each score poll, bypassing the local cache and upstream HTTP cache. Inactive teams load their details when opened, then reuse them until activity resumes. Their total history skips repeated unchanged scores; a new team or a changed official score is still recorded. Graph refreshes replace the complete set of public points and timestamps rather than appending estimates.

Configure → Visible columns → Active adds the same Active/Inactive/Unknown status to the main table.

Teams still listed as active are marked Inactive after three consecutive fresh score refreshes with unchanged source play time (the first observation establishes the baseline). A changed play time resets this count; the estimate never influences activity detection. Cached reads do not count as additional refreshes.

Open details update in place: existing statistics, image entries, graph elements, and panel scroll positions are retained. New history points fade in, and point positions transition as scales change; reduced-motion preferences disable these transitions. Failed graph refreshes keep the previous graph visible.

The public image history also supplies a total-score graph by summing all reported image scores at each timestamp, including before local polling began. Totals include whichever images have reported at each timestamp, so earlier totals remain visible when additional images join. Each image’s last reported score carries forward when it stops reporting; timestamps before any image first reports remain gaps. Individual image charts retain the source gaps. The observed-total graph uses a vertical cursor guide and shows only the nearest recorded point while hovering (keyboard focus also reveals a point). Clicking a different table column sorts ascending first, then descending on its next click.

Both total-score graphs use the vertical hover guide and reveal only the nearest point; individual image graphs retain their point hover. Tooltips appear and disappear immediately. Leaving a graph, scrolling, dismissing details, or moving focus away clears the hover state so subsequent refreshes cannot restore a dismissed tooltip.

Configure → Visible columns includes Found and Remain. These sum the found/remaining counts across each followed team’s images, fetch only when either column or a formula needs them, and follow the existing inactive-team pause. Missing counts display an em dash instead of an incomplete total. Both fields can be used in calculated columns.

Drag the three-dot divider between the table and open details panel to resize their height. The chosen split persists in browser storage across panel toggles and restarts. The focused divider also supports Up/Down arrows, Home, and End.
