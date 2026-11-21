# Utah Hunting Calendar

Stage 1 is a static GitHub Pages project with illustrative data. Serve this directory over HTTP for local review. Place these files at the root of the chosen Pages publishing source. All asset paths are relative, and navigation uses URL hashes so deep links resolve under a repository path.

## Data contract

The top-level JSON object contains `schemaVersion`, `fixture`, `opportunities`, and `events`. IDs are unique and stable within each collection. Each event's `opportunityId` references an opportunity. Dates are Utah calendar dates in YYYY-MM-DD. Date ranges include both endpoints. `time` is optional display text for the current fixture. Stage 2 should add a machine-readable time with explicit timezone semantics for calendar export. `availableFrom` and `availableThrough` are the date-level status bounds for the sample views. `sourceUrl` points to an official HTTPS source; sample URLs point to the agency home page.
