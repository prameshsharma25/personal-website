Optional Server Analysis
The website defaults to on-device descriptor calculations and does not require
this service. Use this worker for full batch alignment/clustering/shortlisting.
See ../../docs/AMYLOID_ON_DEVICE.txt for the browser engine.

AMYLOID ANALYSIS SERVICE

This service runs the existing Amyloid Candidates Python package on uploaded
PDB/mmCIF assemblies. It does not generate predictions. The website connects
directly to the service; coordinates do not pass through a Next.js Function.

QUICK START WITH DOCKER

From this directory:
  docker compose up --build

In the website's .env.local:
  AMYLOID_API_URL=http://127.0.0.1:8001

Restart the website, then open /tools/amyloid-inspector. The default Compose
configuration allows localhost:3000, 127.0.0.1:3000 and 127.0.0.1:3835. Change
AMYLOID_ALLOWED_ORIGINS to the exact frontend origins you use. Trailing slashes
are not part of an origin. Selecting files previews a single structure locally;
selecting Analyze sends them to the worker. Existing-report mode stays local.

For native development, use Python 3.13 in an isolated virtual environment:
  python3.13 -m venv .venv
  .venv/bin/pip install -r requirements.lock

Build MMalign.cpp from the USalign commit recorded in SCIENTIFIC_SOURCES.json
with a C++ compiler (-O3 -ffast-math), then set MMALIGN_BIN to its absolute path.
Run from this directory:
  AMYLOID_DATA_DIR=/absolute/persistent/job-directory MMALIGN_BIN=/absolute/MMalign .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8001 --workers 1 --no-access-log

SCIENTIFIC SCOPE

Per structure: package-normalized first coordinate model, common QC, geometry,
packing, energetics, positive-reference gates, and original coordinate bytes.
The package is pinned to 1c85221ea38ffbaa1695eeb0a2962997abf94563. Biological
assemblies must already be present in the input: this service does not generate
symmetry mates, rebuild missing atoms, or run a prediction model.

Per comparable pool: C-alpha alignment with MM-align, both pair directions,
validated self-alignments, and distance = 1 - mean(min(TM1, TM2) in each direction).
Inputs are split by exact chain sequences and stoichiometry. Different constructs
are not silently combined. Failed alignments are not replaced by guessed values.
Normalized alignment inputs and parsed alignment evidence accompany the archive.

HDBSCAN uses precomputed distances, generic algorithm, EOM selection, epsilon 0,
minimum cluster size 10 and minimum samples 3 by default. Users can change the
last two settings. Pools below the required size report insufficient_pool_size;
noise is not forced into a cluster. Cluster representatives are geometric medoids.

The current released package does not expose the entire pooled selection stage.
The unchanged pct/features/center/supported/greedy functions and MM-align parser
were extracted from the author's frozen research pipeline. Exact original file
hashes and source locations are recorded in SCIENTIFIC_SOURCES.json. Production
has no dependency on the research checkout and reads no benchmark outcomes.

Pool-relative evidence A, confidence percentiles, centrality C, S=.75A+.25I, and
R=.8S+20C follow those frozen functions. Selection requires passing QC, all four
evidence components, A>=50, finite overall and method-stratified confidence,
non-noise membership, and pairwise diversity distance >=0.20. Up to 10 candidates
are returned by default. Confidence CSV columns:
  filename,method,iptm,mean_plddt

Filenames must match uploaded names exactly. ipTM is 0-1; mean pLDDT is 0-100.
Unknown values remain blank/NaN/null; B-factors are not silently interpreted as
confidence. Missing confidence prevents eligibility for the supported shortlist,
but descriptors, comparisons, clustering, and medoids remain available.

These are exploratory uploaded pools, not a calibrated correctness probability
or reproduction of archived benchmark partitions. Tied HDBSCAN edges and native
binary/library differences can affect results. A warning report or a high
relative score is not experimental confirmation of amyloid formation.

ARCHIVE

The ZIP includes original coordinates, raw component outputs, portable manifests
and gate reports, per-group distances, scored members, cluster assignments,
shortlist eligibility, medoids, normalized alignment coordinates, parsed MM-align
pairs, input hashes, software versions, source pins, and license notices.

JSON machine paths/provenance are removed from portable component outputs;
component and manifest checksums are regenerated, while scientific values and
original coordinates are preserved. checksums.json covers every other artifact.
Files are addressed by generated model IDs. Original filenames appear in JSON,
not spreadsheet formulas. Error details stay in the private worker diagnostics.

OPERATING LIMITS

One API process and one background worker per persistent data volume. SQLite
queues jobs and hashed access keys. Only the returned bearer key can read,
download, cancel, or delete a job; keep it private. Keys are kept in browser
session storage, never URLs. Rate-limiting identifiers are keyed hashes of IPs.

Defaults: 125 structures; 25 MiB each; 100 MiB combined; 50,000 atoms and 62
polymer chains per structure; 3 active jobs including uploads and queued work;
3 jobs per client IP/day; 20 jobs globally/day; 2 hours per job; 120 seconds per
MM-align command; 2 GiB on-disk workspace per job; 24-hour retention. The disk
budget is checked periodically, so transient use can be higher. Compose bounds
the container to 2 CPUs, 3 GiB RAM, and 128 processes. It exposes only localhost.

Retention starts at submission. Periodic cleanup removes expired job files and
database rows; running jobs are cancelled at expiry. Delete cancels a running
job before removing its files. On a service restart, queued jobs resume and
interrupted jobs become failed, with a prompt to submit them again. Native
subprocesses are terminated together on cancel, timeout, or owner loss.

Configuration: AMYLOID_DATA_DIR, AMYLOID_ALLOWED_ORIGINS, MMALIGN_BIN,
AMYLOID_MAX_FILES, AMYLOID_MAX_ACTIVE_JOBS, AMYLOID_CLIENT_JOBS_PER_DAY,
AMYLOID_JOBS_PER_DAY, AMYLOID_RETENTION_SECONDS, AMYLOID_JOB_TIMEOUT,
AMYLOID_MAX_ATOMS, AMYLOID_PAIR_TIMEOUT, AMYLOID_MAX_JOB_DISK_BYTES.

HOSTING

The website can stay on Vercel. This implementation needs a continuously running
Docker web service, an HTTPS endpoint, and a persistent writable /data volume.
Deploy one instance with the Dockerfile, set the exact website origins, retain
the CPU/memory/process limits, and set AMYLOID_API_URL on Vercel to its HTTPS URL.
Provide at least 50 GiB disk for the default worst-case daily workspace budget,
or reduce daily job/disk limits. Monitor disk and compute usage. Do not put the
job volume, temporary files, access keys, or worker logs in the public website.

Set proxy upload limits above 101 MiB. Trust forwarded client-IP headers only
from the actual reverse proxy; do not use an unrestricted proxy trust setting.
Otherwise clients may share one IP quota or spoof the rate-limit identity.
Backups, if enabled on the host, need a retention policy consistent with the
site's disclosure. The service does not itself create backups.

As checked November 25, 2026, Vercel offers Python Functions and long-lived
Daemons (public beta). Daemons have no incoming public HTTP endpoint or persistent
volume. Running this exact HTTP/SQLite container as a Vercel Daemon will not work.
A Vercel-only variant needs separate durable job metadata, private object storage,
a queue/claim mechanism, Function endpoints, and a daemon that consumes jobs.
That adapter and cloud resources are not configured by this change. Ordinary
Functions also have duration and request-body limits unsuitable for these batches.

Sources:
https://vercel.com/docs/daemons
https://vercel.com/docs/functions/limitations
https://vercel.com/docs/background-workers

VALIDATION

From the repository root with the Python environment installed:
  AMYLOID_DATA_DIR=/tmp/amyloid-test-import PYTHONPATH=services/amyloid services/amyloid/.venv/bin/python -m pytest services/amyloid/tests -q
  npm run test
  npm run typecheck
  npm run lint
  npm run build

Start the worker and website, then run the real integration browser test:
  AMYLOID_INTEGRATION=1 TEST_BASE_URL=http://127.0.0.1:3000 npm run test:browser -- tests/browser/amyloid-analysis.spec.ts

The integration test submits real coordinates, checks generated report/manifest/
coordinate hashes, downloads results, resumes after refresh, and deletes the job.
Other tests cover upload limits, access isolation, cancellation, expiry, distance
validation, clustering, missing confidence, and shortlist diversity.
