# Utah Hunting Calendar

Stage 2 adds a selected, source-linked 2026–27 dataset across the ten agreed categories and individual calendar downloads. This is program-level coverage with selected season windows. Consult the linked DWR sources for unit-by-unit dates, current inventory, and applicable requirements.

## Publish the update

Upload the five files from the ZIP directly to your existing repository's main branch and commit them. Keep the existing Pages settings. Once GitHub deploys the update, open Calendar, go to December 2026, and choose Agenda. Search for spring limited-entry turkey and open its details. Download the application deadline as a timed event and the season as an all-day date range.

## Data contract

The JSON document contains schemaVersion, fixture, opportunities, and events. Each opportunity has a stable ID, year, species, title, type, unit, source URL, and source review date. Optional actionUrl and note fields describe the official next step and eligibility. Application and season windows use inclusive local calendar dates in availableFrom and availableThrough. Sales without known inventory or an end date show Check availability after the opener.

Each event has a stable ID, opportunityId, label, start date, and source URL. An optional end stores the inclusive end of a date range. An optional startsAt stores the published local timestamp with its explicit UTC offset. Calendar files use UTC for timed events and an exclusive end for all-day events.

## Stage 3 draw planner

Upload all six extracted files to the same publishing branch. The new Draw planner link uses browser-local storage for points by program and residency. The initial draw-history dataset covers selected 2025 general-season and antlerless deer cohorts. Each row records the report year, hunt code, residency, exact points, reported eligible applicant and permit counts, pool label, and source page. See the official report links for other hunt codes and years. Purchase alternatives reuse the existing calendar records.
